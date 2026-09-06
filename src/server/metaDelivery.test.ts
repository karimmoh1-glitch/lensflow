import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { deliverToCustomer } from "@/server/deliver";
import { disconnectIntegration } from "@/app/actions/connect";
import { integrationUsage } from "@/server/integrationQuota";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

/**
 * The outbound Meta path against the real database, with Meta itself replaced by recorded
 * responses (simulated — no request reaches Meta here). What is being proved is the part
 * Daythread controls: nothing is ever marked SENT that a provider did not accept, the
 * 24-hour WhatsApp window is enforced on the server before anything leaves, a dead token
 * flips the connection to "reconnect" while a provider outage does not, and one workspace's
 * credentials are never used for another's send.
 */
type Recorded = { status: number; body: unknown };
let recorded: Recorded[] = [];
const requests: Array<{ url: string; init: RequestInit }> = [];

function record(...responses: Recorded[]) {
  recorded = responses;
}

describe("Meta outbound delivery", () => {
  let aId: string;
  let bId: string;

  beforeAll(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    aId = (await prisma.business.create({ data: { name: "Meta Send A", handle: `meta-send-a-${stamp}` } })).id;
    bId = (await prisma.business.create({ data: { name: "Meta Send B", handle: `meta-send-b-${stamp}` } })).id;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      requests.push({ url: String(url), init });
      const next = recorded.shift() ?? { status: 200, body: {} };
      return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
    });
  });
  afterEach(() => {
    recorded = [];
    requests.length = 0;
  });
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: [aId, bId] } } });
    vi.unstubAllGlobals();
  });

  const send = (businessId: string, channel: "INSTAGRAM" | "WHATSAPP", to: string, lastInboundAt: Date | null) =>
    deliverToCustomer({ businessId, businessName: "Studio", businessHandle: "studio", channel, to, body: "Hi there", lastInboundAt });

  it("Instagram: refuses to send at all when the workspace has no connection", async () => {
    const r = await send(aId, "INSTAGRAM", "igsid_1", null);
    expect(r.status).toBe("NOT_DELIVERED");
    expect(r.statusDetail).toBe("not_connected");
    expect(requests).toHaveLength(0);
  });

  it("Instagram: a real send is only SENT once Meta returns its own message id", async () => {
    await prisma.integration.create({ data: { businessId: aId, provider: "INSTAGRAM", status: "CONNECTED", externalId: "ig_acct_a", externalAccount: "@a", accessToken: "IGAAtoken" } });
    record({ status: 200, body: { recipient_id: "igsid_1", message_id: "mid.abc123" } });
    const r = await send(aId, "INSTAGRAM", "igsid_1", null);
    expect(r.status).toBe("SENT");
    expect(r.providerMessageId).toBe("mid.abc123");
    expect(requests[0].url).toContain("/ig_acct_a/messages");
  });

  it("Instagram: a 200 with no message id is a failure, not a silent success", async () => {
    record({ status: 200, body: { recipient_id: "igsid_1" } });
    const r = await send(aId, "INSTAGRAM", "igsid_1", null);
    expect(r.status).toBe("FAILED");
  });

  it("Instagram: a revoked token flips the connection to needs-attention and never says sent", async () => {
    record({ status: 401, body: { error: { message: "Error validating access token", code: 190, error_subcode: 463 } } });
    const r = await send(aId, "INSTAGRAM", "igsid_1", null);
    expect(r.status).toBe("FAILED");
    expect(r.error).not.toContain("IGAAtoken");
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: aId, provider: "INSTAGRAM" } } });
    expect(row?.status).toBe("NEEDS_ATTENTION");
    await prisma.integration.update({ where: { id: row!.id }, data: { status: "CONNECTED", lastError: null } });
  });

  it("Instagram: a provider outage fails the send but keeps the connection", async () => {
    record({ status: 500, body: { error: { message: "internal" } } });
    const r = await send(aId, "INSTAGRAM", "igsid_1", null);
    expect(r.status).toBe("FAILED");
    expect(r.error).toMatch(/their side|try again/i);
    expect((await prisma.integration.findUnique({ where: { businessId_provider: { businessId: aId, provider: "INSTAGRAM" } } }))?.status).toBe("CONNECTED");
  });

  it("WhatsApp: outside the 24-hour window nothing is sent, and the reason says so", async () => {
    await prisma.integration.create({ data: { businessId: bId, provider: "WHATSAPP", status: "CONNECTED", externalId: "pn_b", externalAccount: "+1 555", accessToken: "EAAtoken", settings: { wabaId: "waba_b", phoneNumberId: "pn_b" } } });
    const r = await send(bId, "WHATSAPP", "+15550001111", new Date(Date.now() - 25 * 3600 * 1000));
    expect(r.status).toBe("NOT_DELIVERED");
    expect(r.statusDetail).toBe("window_closed");
    expect(r.error).toMatch(/Saved, not delivered/);
    expect(r.error).toMatch(/template/i);
    // Enforced before the network, so Meta is never asked to reject it.
    expect(requests).toHaveLength(0);
  });

  it("WhatsApp: a customer who has never written is outside the window too", async () => {
    const r = await send(bId, "WHATSAPP", "+15550001111", null);
    expect(r.statusDetail).toBe("window_closed");
    expect(requests).toHaveLength(0);
  });

  it("WhatsApp: inside the window the Cloud API is called and the provider id is stored", async () => {
    record({ status: 200, body: { messages: [{ id: "wamid.XYZ" }] } });
    const r = await send(bId, "WHATSAPP", "+1 (555) 000-1111", new Date(Date.now() - 60_000));
    expect(r.status).toBe("SENT");
    expect(r.providerMessageId).toBe("wamid.XYZ");
    expect(requests[0].url).toContain("/pn_b/messages");
    expect(String(requests[0].init.body)).toContain('"to":"15550001111"');
  });

  it("WhatsApp: Meta's own window rejection is recorded as not-delivered, never as failed-to-be-retried", async () => {
    record({ status: 400, body: { error: { message: "Re-engagement message", code: 131047 } } });
    const r = await send(bId, "WHATSAPP", "+15550001111", new Date(Date.now() - 60_000));
    expect(r.status).toBe("NOT_DELIVERED");
    expect(r.statusDetail).toBe("window_closed");
  });

  it("never uses another workspace's connection", async () => {
    // A has Instagram, B has WhatsApp. Each is refused on the channel it does not own.
    const igFromB = await send(bId, "INSTAGRAM", "igsid_1", null);
    expect(igFromB.statusDetail).toBe("not_connected");
    const waFromA = await send(aId, "WHATSAPP", "+15550001111", new Date());
    expect(waFromA.statusDetail).toBe("not_connected");
    expect(requests).toHaveLength(0);
  });

  it("a stored credential that cannot be read is a reconnect, never a send", async () => {
    // What a token encrypted under a key this deployment no longer has looks like coming
    // back out of the database: null.
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: aId, provider: "INSTAGRAM" } } });
    await prisma.integration.update({ where: { id: row!.id }, data: { accessToken: null } });
    const r = await send(aId, "INSTAGRAM", "igsid_1", null);
    expect(r.status).toBe("NOT_DELIVERED");
    expect(r.statusDetail).toBe("reauth_required");
    expect(requests).toHaveLength(0);
    expect((await prisma.integration.findUnique({ where: { id: row!.id } }))?.status).toBe("NEEDS_ATTENTION");
    await prisma.integration.update({ where: { id: row!.id }, data: { status: "CONNECTED", accessToken: "IGAAtoken", lastError: null } });
  });
});

describe("Meta disconnect", () => {
  const ids: string[] = [];
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
    vi.unstubAllGlobals();
  });

  async function connectedWorkspace() {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const b = await prisma.business.create({ data: { name: "Disc", handle: `meta-disc-${stamp}`, planTier: "FREE" } });
    const u = await prisma.user.create({ data: { name: "O", email: `meta-disc-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: u.id, businessId: b.id, role: "OWNER" } });
    await prisma.integration.create({ data: { businessId: b.id, provider: "INSTAGRAM", status: "CONNECTED", externalId: "ig_disc", externalAccount: "@disc", accessToken: "IGAAtoken", scopes: "instagram_business_basic" } });
    const client = await prisma.client.create({ data: { businessId: b.id, name: "Nadia", instagram: "igsid_disc" } });
    const conv = await prisma.conversation.create({ data: { businessId: b.id, clientId: client.id, channel: "INSTAGRAM", externalHandle: "igsid_disc", lastMessageAt: new Date() } });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "INBOUND", body: "Are you free?" } });
    ids.push(b.id);
    return { businessId: b.id, session: { userId: u.id, activeBusinessId: b.id }, clientId: client.id, conversationId: conv.id };
  }

  it("erases the credential, releases the plan slot and keeps every conversation", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    const w = await connectedWorkspace();
    expect((await integrationUsage(w.businessId)).active).toBe(1);
    const r = await disconnectIntegration("INSTAGRAM", w.session);
    expect(r.error).toBeUndefined();
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: w.businessId, provider: "INSTAGRAM" } } });
    expect(row?.status).toBe("NOT_CONNECTED");
    expect(row?.accessToken).toBeNull();
    expect(row?.refreshToken).toBeNull();
    expect(row?.externalId).toBeNull();
    expect(row?.scopes).toBeNull();
    expect((await integrationUsage(w.businessId)).active).toBe(0);
    // History is not deleted: the thread, the messages and the customer all stay.
    expect(await prisma.conversation.count({ where: { id: w.conversationId } })).toBe(1);
    expect(await prisma.message.count({ where: { conversationId: w.conversationId } })).toBe(1);
    expect(await prisma.client.count({ where: { id: w.clientId } })).toBe(1);
  });

  it("still disconnects locally when Meta refuses the unsubscribe", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { message: "gone", code: 190 } }), { status: 400 }));
    const w = await connectedWorkspace();
    const r = await disconnectIntegration("INSTAGRAM", w.session);
    expect(r.error).toBeUndefined();
    expect((await prisma.integration.findUnique({ where: { businessId_provider: { businessId: w.businessId, provider: "INSTAGRAM" } } }))?.accessToken).toBeNull();
  });

  it("reconnecting reuses the same row rather than creating a second connection", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    const w = await connectedWorkspace();
    await disconnectIntegration("INSTAGRAM", w.session);
    const { activateIntegration } = await import("./integrationQuota");
    const again = await activateIntegration({
      businessId: w.businessId,
      provider: "INSTAGRAM",
      create: { externalAccount: "@disc", externalId: "ig_disc", accessToken: "IGAAtoken2", wanted: false },
      update: { externalAccount: "@disc", externalId: "ig_disc", accessToken: "IGAAtoken2", wanted: false },
    });
    expect(again.ok).toBe(true);
    expect(await prisma.integration.count({ where: { businessId: w.businessId, provider: "INSTAGRAM" } })).toBe(1);
    expect((await integrationUsage(w.businessId)).active).toBe(1);
  });

  it("a teammate who is not an owner or admin cannot disconnect", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    const w = await connectedWorkspace();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const helper = await prisma.user.create({ data: { name: "Helper", email: `meta-helper-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: helper.id, businessId: w.businessId, role: "PHOTOGRAPHER" } });
    await expect(disconnectIntegration("INSTAGRAM", { userId: helper.id, activeBusinessId: w.businessId })).rejects.toThrow(/unauthorized/);
    expect((await prisma.integration.findUnique({ where: { businessId_provider: { businessId: w.businessId, provider: "INSTAGRAM" } } }))?.status).toBe("CONNECTED");
  });
  it("a disconnect never reaches into another workspace", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    const mine = await connectedWorkspace();
    const theirs = await connectedWorkspace();
    await disconnectIntegration("INSTAGRAM", mine.session);
    const untouched = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: theirs.businessId, provider: "INSTAGRAM" } } });
    expect(untouched?.status).toBe("CONNECTED");
    expect(untouched?.accessToken).toBe("IGAAtoken");
  });
});
