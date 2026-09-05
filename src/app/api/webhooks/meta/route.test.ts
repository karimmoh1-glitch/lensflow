import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** Signed Meta events against the real route and database. No network: profile lookups
 * are skipped because the fixture integrations carry no access token. */
const SECRET = "meta_app_secret_test";
let GET: (req: Request) => Promise<Response>;
let POST: (req: Request) => Promise<Response>;
const sign = (body: string) => "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
const post = (body: object, sig?: string) => {
  const raw = JSON.stringify(body);
  return POST(new Request("http://localhost/api/webhooks/meta", { method: "POST", body: raw, headers: { "x-hub-signature-256": sig ?? sign(raw), "content-type": "application/json" } }));
};

describe("Meta webhook", () => {
  let aId: string;
  let bId: string;
  const igA = `ig_a_${Date.now()}`;
  const waB = `pn_b_${Date.now()}`;

  beforeAll(async () => {
    vi.stubEnv("META_APP_SECRET", SECRET);
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify-me");
    ({ GET, POST } = await import("./route"));
    await prisma.webhookEvent.deleteMany({ where: { provider: "meta" } });
    const stamp = Date.now();
    aId = (await prisma.business.create({ data: { name: "Meta A", handle: `meta-a-${stamp}` } })).id;
    bId = (await prisma.business.create({ data: { name: "Meta B", handle: `meta-b-${stamp}` } })).id;
    await prisma.integration.create({ data: { businessId: aId, provider: "INSTAGRAM", status: "CONNECTED", externalId: igA, externalAccount: "@a" } });
    await prisma.integration.create({ data: { businessId: bId, provider: "WHATSAPP", status: "CONNECTED", externalId: waB, externalAccount: "+1555" } });
  });
  afterAll(async () => {
    await prisma.business.delete({ where: { id: aId } });
    await prisma.business.delete({ where: { id: bId } });
    await prisma.webhookEvent.deleteMany({ where: { provider: "meta" } });
    vi.unstubAllEnvs();
  });

  it("answers the verification handshake only with the right token", async () => {
    const ok = await GET(new Request("http://localhost/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    const bad = await GET(new Request("http://localhost/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"));
    expect(bad.status).toBe(403);
  });

  it("rejects a bad signature and a malformed body", async () => {
    expect((await post({ object: "instagram", entry: [] }, "sha256=00")).status).toBe(401);
    const raw = "not json";
    const r = await POST(new Request("http://localhost/api/webhooks/meta", { method: "POST", body: raw, headers: { "x-hub-signature-256": sign(raw) } }));
    expect(r.status).toBe(400);
  });

  it("routes an Instagram DM to the business that owns the account, once", async () => {
    const mid = `mid_${Date.now()}`;
    const body = { object: "instagram", entry: [{ id: igA, time: 1, messaging: [{ sender: { id: "igsid_777" }, recipient: { id: igA }, timestamp: 1, message: { mid, text: "Are you free Tuesday?" } }] }] };
    const r = await post(body);
    expect(r.status).toBe(200);
    const conv = await prisma.conversation.findFirst({ where: { businessId: aId, channel: "INSTAGRAM", externalHandle: "igsid_777" }, include: { messages: true } });
    expect(conv?.messages).toHaveLength(1);
    expect(conv?.messages[0].providerMessageId).toBe(mid);
    // Same delivery again (Meta retry): acknowledged, not reprocessed.
    const again = await post(body);
    expect(await again.json()).toMatchObject({ duplicate: true });
    // Same message in a new envelope (different timestamp): ingestion dedupes on mid.
    await post({ ...body, entry: [{ ...body.entry[0], time: 2 }] });
    expect(await prisma.message.count({ where: { conversationId: conv!.id } })).toBe(1);
    expect(await prisma.conversation.count({ where: { businessId: bId } })).toBe(0);
  });

  it("ignores events for accounts nobody connected, and echoes of our own sends", async () => {
    const r = await post({ object: "instagram", entry: [{ id: "ig_unknown", time: 1, messaging: [{ sender: { id: "x" }, recipient: { id: "ig_unknown" }, message: { mid: `m_${Date.now()}`, text: "hi" } }] }] });
    expect(await r.json()).toMatchObject({ handled: 0 });
    const echo = await post({ object: "instagram", entry: [{ id: igA, time: 3, messaging: [{ sender: { id: igA }, recipient: { id: "igsid_777" }, message: { mid: `m_echo_${Date.now()}`, text: "our reply", is_echo: true } }] }] });
    expect(await echo.json()).toMatchObject({ handled: 0 });
  });

  it("applies WhatsApp delivery statuses only to the owning business's message", async () => {
    const client = await prisma.client.create({ data: { businessId: bId, name: "WA Customer", phone: "+15550001111" } });
    const conv = await prisma.conversation.create({ data: { businessId: bId, clientId: client.id, channel: "WHATSAPP", externalHandle: "+15550001111", lastMessageAt: new Date() } });
    const msg = await prisma.message.create({ data: { conversationId: conv.id, direction: "OUTBOUND", body: "See you Friday", status: "SENT", providerMessageId: "wamid.ABC" } });
    await post({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: waB }, statuses: [{ id: "wamid.ABC", status: "delivered", timestamp: "1788600000" }] } }] }] });
    expect((await prisma.message.findUnique({ where: { id: msg.id } }))?.status).toBe("DELIVERED");
    await post({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: waB }, statuses: [{ id: "wamid.ABC", status: "failed", timestamp: "1788600100", errors: [{ code: 131047, title: "Re-engagement message" }] }] } }] }] });
    const failed = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(failed?.status).toBe("FAILED");
    expect(failed?.statusDetail).toContain("131047");
    // A status about that id arriving on another business's number changes nothing.
    await prisma.message.update({ where: { id: msg.id }, data: { status: "SENT", statusDetail: null } });
    await post({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: "pn_someone_else" }, statuses: [{ id: "wamid.ABC", status: "read", timestamp: "1" }] } }] }] });
    expect((await prisma.message.findUnique({ where: { id: msg.id } }))?.status).toBe("SENT");
  });

  it("ingests a WhatsApp text into the owning business with an E.164 identity", async () => {
    await post({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: waB }, contacts: [{ wa_id: "15550002222", profile: { name: "Sam Okafor" } }], messages: [{ from: "15550002222", id: `wamid.in_${Date.now()}`, type: "text", text: { body: "Can we do Thursday 4pm?" } }] } }] }] });
    const conv = await prisma.conversation.findFirst({ where: { businessId: bId, channel: "WHATSAPP", externalHandle: "+15550002222" }, include: { client: true } });
    expect(conv?.client?.name).toBe("Sam Okafor");
    expect(conv?.client?.phone).toBe("+15550002222");
  });
});
