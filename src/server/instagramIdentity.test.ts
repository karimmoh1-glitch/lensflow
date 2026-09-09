import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { processMetaEnvelope } from "@/server/metaInbound";
import { syncInstagramForBusiness, resolveInstagramIdentity } from "@/server/instagramSync";
import { getInboxVersion } from "@/server/inboxSignal";
import { deliverToCustomer } from "@/server/deliver";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

/**
 * The identity bug, pinned. Synthetic ids throughout: PRO is a professional account id (the
 * form Meta puts in webhook entry[].id), APP is the app-scoped user id.
 */
const PRO = "17841400009990001";
const APP = "26270000009990001";
const OTHER_PRO = "17841400009990002";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
/** Meta, scripted by URL and by the token that asks — never by call order. */
const profiles: Record<string, unknown> = {};
let conversations: unknown = { data: [] };
let subscription: unknown = { data: [{ subscribed_fields: ["messages"] }] };
let sendReply: unknown = { recipient_id: "x", message_id: "mid_out" };
let conversationsStatus = 200;
const requests: string[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const dm = (accountId: string, sender: string, mid: string, extra: Record<string, unknown> = {}) => ({ object: "instagram", entry: [{ id: accountId, time: Date.now(), messaging: [{ sender: { id: sender }, recipient: { id: accountId }, timestamp: Date.now(), message: { mid, text: "Do you have Saturday open?", ...extra } }] }] });

describe("Instagram identity", () => {
  const ids: string[] = [];
  let a: string; let b: string;
  beforeAll(async () => {
    a = (await prisma.business.create({ data: { name: "IG Identity A", handle: `igid-a-${stamp()}` } })).id;
    b = (await prisma.business.create({ data: { name: "IG Identity B", handle: `igid-b-${stamp()}` } })).id;
    ids.push(a, b);
    vi.stubGlobal("fetch", async (url: string) => {
      const u = String(url);
      requests.push(u);
      const token = new URL(u).searchParams.get("access_token") ?? "";
      if (/\/me\?/.test(u)) return json(profiles[token] ?? { error: { message: "unknown token", code: 190 } }, profiles[token] ? 200 : 401);
      if (u.includes("/me/conversations")) return json(conversations, conversationsStatus);
      if (u.includes("/subscribed_apps")) return json(subscription);
      if (u.includes("/messages")) return json(sendReply);
      return json({}); // sender profile lookups: unknown
    });
  });
  afterEach(() => { requests.length = 0; conversations = { data: [] }; conversationsStatus = 200; });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); vi.unstubAllGlobals(); });

  it("a legacy row (app-scoped id in externalId) is repaired from Meta's answer on the first webhook, and the DM lands in the right workspace once", async () => {
    await prisma.integration.create({ data: { businessId: a, provider: "INSTAGRAM", status: "CONNECTED", externalId: APP, externalAccount: "@studio_a", accessToken: "IGAAtoken", settings: { instagramUserId: APP, username: "studio_a", webhooksSubscribed: true } } });
    const v0 = await getInboxVersion(a);
    profiles["IGAAtoken"] = { id: APP, user_id: PRO, username: "studio_a", account_type: "BUSINESS" };
    const mid = `mid_${stamp()}`;
    const r = await processMetaEnvelope(dm(PRO, "igsid_cust1", mid));
    expect(r.handled).toBe(1);
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: a, provider: "INSTAGRAM" } } });
    expect(row?.externalId).toBe(PRO);
    expect((row?.settings as { appScopedUserId?: string }).appScopedUserId).toBe(APP);
    expect(row?.accessToken).toBe("IGAAtoken");
    const msg = await prisma.message.findFirst({ where: { providerMessageId: mid }, include: { conversation: true } });
    expect(msg?.direction).toBe("INBOUND");
    expect(msg?.conversation.businessId).toBe(a);
    expect(await getInboxVersion(a)).toBeGreaterThan(v0);
    // Redelivery: still one message.
    expect((await processMetaEnvelope(dm(PRO, "igsid_cust1", mid))).handled).toBe(1);
    expect(await prisma.message.count({ where: { providerMessageId: mid } })).toBe(1);
  });

  it("the app-scoped id is not a routing key: an event addressed to it is unknown, and so is a professional id nobody holds", async () => {
    const before = await prisma.message.count({ where: { conversation: { businessId: a } } });
    expect(await processMetaEnvelope(dm(APP, "igsid_cust2", `mid_${stamp()}`))).toMatchObject({ handled: 0, ignored: 1 });
    expect(await processMetaEnvelope(dm(OTHER_PRO, "igsid_cust2", `mid_${stamp()}`))).toMatchObject({ handled: 0, ignored: 1 });
    expect(await prisma.message.count({ where: { conversation: { businessId: a } } })).toBe(before);
    expect(requests.some((u) => u.includes("/me?") && u.includes("IGAAtoken"))).toBe(false); // a resolved row is not re-asked
  });

  it("our own messages are never inbound: an echo, a sender equal to either of our ids, a reply we sent", async () => {
    const before = await prisma.message.count({ where: { conversation: { businessId: a } } });
    expect((await processMetaEnvelope(dm(PRO, "igsid_cust1", `mid_${stamp()}`, { is_echo: true }))).ignored).toBe(1);
    expect((await processMetaEnvelope(dm(PRO, PRO, `mid_${stamp()}`))).ignored).toBe(1);
    expect((await processMetaEnvelope(dm(PRO, APP, `mid_${stamp()}`))).ignored).toBe(1);
    expect(await prisma.message.count({ where: { conversation: { businessId: a } } })).toBe(before);
    // A reply goes out with the professional id on the messaging endpoint and is stored OUTBOUND.
    sendReply = { recipient_id: "igsid_cust1", message_id: `mid_out_${stamp()}` };
    const sent = await deliverToCustomer({ businessId: a, businessName: "A", businessHandle: "a", channel: "INSTAGRAM", to: "igsid_cust1", body: "Yes — Saturday 2pm?" });
    expect(sent.status).toBe("SENT");
    expect(requests.some((u) => u.includes(`/${PRO}/messages`))).toBe(true);
  });

  it("reconciliation queries the same account, filters self by both ids, skips no customer message, and stays tenant-safe", async () => {
    const midNew = `mid_rec_${stamp()}`;
    conversations = { data: [{ id: "c1", participants: { data: [{ id: APP, username: "studio_a" }, { id: "igsid_cust1", username: "sam" }] }, messages: { data: [
      { id: `mid_self_${stamp()}`, from: { id: APP }, message: "our reply under the app-scoped id", created_time: new Date().toISOString() },
      { id: `mid_self2_${stamp()}`, from: { id: PRO }, message: "our reply under the professional id", created_time: new Date().toISOString() },
      { id: midNew, from: { id: "igsid_cust1" }, message: "Saturday works!", created_time: new Date().toISOString() },
    ] } }] };
    const r = await syncInstagramForBusiness(a);
    expect(r).toMatchObject({ ok: true, ingested: 1 });
    const stored = await prisma.message.findFirst({ where: { providerMessageId: midNew }, include: { conversation: true } });
    expect(stored?.direction).toBe("INBOUND");
    expect(stored?.conversation.businessId).toBe(a);
    expect(await prisma.message.count({ where: { conversation: { businessId: a }, providerMessageId: { startsWith: "mid_self" } } })).toBe(0);
    expect(await prisma.conversation.count({ where: { businessId: b } })).toBe(0);
  });

  it("repair refuses a token whose username no longer matches, and never steals an id another workspace holds", async () => {
    await prisma.integration.create({ data: { businessId: b, provider: "INSTAGRAM", status: "CONNECTED", externalId: "26270000009990002", externalAccount: "@studio_b", accessToken: "IGAAtokenB", settings: { username: "studio_b" } } });
    const rowB = (await prisma.integration.findUnique({ where: { businessId_provider: { businessId: b, provider: "INSTAGRAM" } } }))!;
    profiles["IGAAtokenB"] = { id: "26270000009990002", user_id: OTHER_PRO, username: "someone_else", account_type: "BUSINESS" };
    expect((await resolveInstagramIdentity(rowB)).reason).toBe("username mismatch");
    profiles["IGAAtokenB"] = { id: "26270000009990002", user_id: PRO, username: "studio_b", account_type: "BUSINESS" };
    expect((await resolveInstagramIdentity(rowB)).reason).toBe("id in use");
    expect((await prisma.integration.findUnique({ where: { id: rowB.id } }))?.externalId).toBe("26270000009990002");
    profiles["IGAAtokenB"] = { id: "26270000009990002", user_id: OTHER_PRO, username: "studio_b", account_type: "BUSINESS" };
    expect((await resolveInstagramIdentity(rowB)).repaired).toBe(true);
    expect((await prisma.integration.findUnique({ where: { id: rowB.id } }))?.externalId).toBe(OTHER_PRO);
    // Now each account routes to exactly its own workspace.
    const midB = `mid_b_${stamp()}`;
    await processMetaEnvelope(dm(OTHER_PRO, "igsid_custB", midB));
    expect((await prisma.message.findFirst({ where: { providerMessageId: midB }, include: { conversation: true } }))?.conversation.businessId).toBe(b);
  });
});
