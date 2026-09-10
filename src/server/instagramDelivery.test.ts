import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { runInstagramDeliveryCheck } from "@/server/instagramDelivery";
import { processMetaEnvelope } from "@/server/metaInbound";
import { listConversations } from "@/server/mobileRead";

/**
 * The delivery check, and the acceptance criterion itself: an ordinary inbound DM becomes a
 * conversation a person can actually see in the inbox. Meta is stubbed at the network edge
 * by URL, so no request leaves the machine and no real credential is involved.
 */
const PRO = "17841400009991001";
const APP = "26270000009991001";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let subscribedFields: string[] = ["messages"];
let appSubs: unknown = { data: [{ object: "instagram", callback_url: "https://daythread.org/api/webhooks/meta", fields: [{ name: "messages" }], active: true }] };
let conversations: unknown = { data: [] };
let subsStatus = 200;

describe("Instagram delivery check", () => {
  const ids: string[] = [];
  let biz: string;

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://daythread.org");
    vi.stubEnv("INSTAGRAM_APP_ID", "1111111111111111");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    biz = (await prisma.business.create({ data: { name: "Delivery A", handle: `deliv-a-${stamp()}` } })).id;
    ids.push(biz);
    await prisma.integration.create({ data: { businessId: biz, provider: "INSTAGRAM", status: "CONNECTED", externalId: PRO, externalAccount: "@studio", accessToken: "IGAAtok", settings: { professionalAccountId: PRO, appScopedUserId: APP, instagramUserId: PRO, username: "studio", webhooksSubscribed: true } } });
    vi.stubGlobal("fetch", async (url: string) => {
      const u = String(url);
      if (u.includes("/subscriptions")) return json(appSubs, 200);
      if (u.includes("/subscribed_apps")) return json({ data: [{ subscribed_fields: subscribedFields }] }, subsStatus);
      if (u.includes("/conversations")) return json(conversations);
      return json({});
    });
  });
  afterEach(() => { subscribedFields = ["messages"]; subsStatus = 200; conversations = { data: [] }; appSubs = { data: [{ object: "instagram", callback_url: "https://daythread.org/api/webhooks/meta", fields: [{ name: "messages" }], active: true }] }; });
  afterAll(async () => { await prisma.webhookEvent.deleteMany({ where: { businessId: { in: ids } } }); await prisma.business.deleteMany({ where: { id: { in: ids } } }); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("names the app-level gap when the account is subscribed but the app has no messages field", async () => {
    appSubs = { data: [{ object: "instagram", callback_url: "https://daythread.org/api/webhooks/meta", fields: [{ name: "comments" }], active: true }] };
    const r = await runInstagramDeliveryCheck(biz);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.check.account.subscribed).toBe(true);
    expect(r.check.app.messagesField).toBe(false);
    expect(r.check.verdict).toMatch(/app itself has no 'messages' webhook field/i);
  });

  it("names a callback pointing somewhere else", async () => {
    appSubs = { data: [{ object: "instagram", callback_url: "https://someone-elses-deploy.example/api/webhooks/meta", fields: [{ name: "messages" }], active: true }] };
    const r = await runInstagramDeliveryCheck(biz);
    if (!r.ok) throw new Error("expected ok");
    expect(r.check.app.callbackMatches).toBe(false);
    expect(r.check.verdict).toMatch(/different URL/i);
  });

  it("tells the truth when Meta says the account is not subscribed, and does not keep a stale true", async () => {
    subscribedFields = [];
    const r = await runInstagramDeliveryCheck(biz);
    if (!r.ok) throw new Error("expected ok");
    expect(r.check.account.subscribed).toBe(false);
    expect(r.check.verdict).toMatch(/not subscribed/i);
    const row = await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: biz, provider: "INSTAGRAM" } } });
    expect((row.settings as { webhooksSubscribed?: boolean }).webhooksSubscribed).toBe(false);
  });

  it("the production case: Meta holds a customer message but has delivered nothing here", async () => {
    conversations = { data: [{ id: "c1", participants: { data: [{ id: PRO, username: "studio" }, { id: "igsid_cust", username: "cust" }] }, messages: { data: [{ id: `mid_${stamp()}`, from: { id: "igsid_cust" }, message: "hello", created_time: new Date().toISOString() }] } }] };
    const r = await runInstagramDeliveryCheck(biz);
    if (!r.ok) throw new Error("expected ok");
    expect(r.check.mailbox.withInbound).toBe(1);
    // Scoped to this workspace: another tenant's deliveries must not make this one look healthy.
    expect(r.check.deliveries.last24h).toBe(0);
    expect(r.check.deliveries.total).toBe(0);
    expect(r.check.verdict).toMatch(/delivered no webhook here in 24 hours/i);
    // The recorded summary is states and counts: no token, no message text, no full sender id.
    const row = await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: biz, provider: "INSTAGRAM" } } });
    const written = JSON.stringify((row.settings as { deliveryCheck?: unknown }).deliveryCheck);
    expect(written).not.toContain("IGAAtok");
    expect(written).not.toContain("hello");
    expect(written).not.toContain("igsid_cust");
    expect(written).toContain("…cust".slice(-4));
  });

  it("counts only this workspace's deliveries, never another tenant's", async () => {
    const other = (await prisma.business.create({ data: { name: "Delivery C", handle: `deliv-c-${stamp()}` } })).id;
    ids.push(other);
    await prisma.webhookEvent.create({ data: { provider: "meta", eventId: `other_${stamp()}`, businessId: other, status: "processed" } });
    const r = await runInstagramDeliveryCheck(biz);
    if (!r.ok) throw new Error("expected ok");
    expect(r.check.deliveries.total).toBe(0);
    expect(r.check.deliveries.last24h).toBe(0);
    await prisma.webhookEvent.create({ data: { provider: "meta", eventId: `mine_${stamp()}`, businessId: biz, status: "processed", payload: { object: "instagram", handled: 0, ignored: 1, reasons: ["recipient_mismatch"] } } });
    const r2 = await runInstagramDeliveryCheck(biz);
    if (!r2.ok) throw new Error("expected ok");
    expect(r2.check.deliveries.total).toBe(1);
    expect(r2.check.deliveries.lastReasons).toEqual(["recipient_mismatch"]);
  });

  it("a refusal from Meta is reported, not swallowed as a healthy answer", async () => {
    subsStatus = 400;
    const r = await runInstagramDeliveryCheck(biz);
    if (!r.ok) throw new Error("expected ok");
    expect(r.check.account.error).toBeTruthy();
    expect(r.check.verdict).toMatch(/did not answer/i);
  });

  it("refuses when Instagram is not connected for the workspace", async () => {
    const other = (await prisma.business.create({ data: { name: "Delivery B", handle: `deliv-b-${stamp()}` } })).id;
    ids.push(other);
    expect(await runInstagramDeliveryCheck(other)).toMatchObject({ ok: false });
  });
});

describe("acceptance criterion: an inbound DM is visible in the inbox", () => {
  const ids: string[] = [];
  let biz: string;
  const PRO2 = "17841400009991002";
  beforeAll(async () => {
    biz = (await prisma.business.create({ data: { name: "Inbox Visible", handle: `inbox-vis-${stamp()}` } })).id;
    ids.push(biz);
    await prisma.integration.create({ data: { businessId: biz, provider: "INSTAGRAM", status: "CONNECTED", externalId: PRO2, externalAccount: "@studio2", settings: { professionalAccountId: PRO2, username: "studio2" } } });
    vi.stubGlobal("fetch", async () => json({}));
  });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); vi.unstubAllGlobals(); });

  it("a DM from an ordinary account becomes a conversation the inbox query returns", async () => {
    const mid = `mid_vis_${stamp()}`;
    const sender = "igsid_ordinary_person";
    const r = await processMetaEnvelope({ object: "instagram", entry: [{ id: PRO2, time: Date.now(), messaging: [{ sender: { id: sender }, recipient: { id: PRO2 }, timestamp: Date.now(), message: { mid, text: "Do you shoot weddings in June?" } }] }] });
    expect(r).toMatchObject({ handled: 1, ignored: 0 });

    const stored = await prisma.message.findFirstOrThrow({ where: { providerMessageId: mid }, include: { conversation: { include: { client: true, lead: true } } } });
    expect(stored.direction).toBe("INBOUND");
    expect(stored.body).toBe("Do you shoot weddings in June?");
    expect(stored.conversation.businessId).toBe(biz);
    expect(stored.conversation.channel).toBe("INSTAGRAM");
    expect(stored.conversation.externalHandle).toBe(sender);
    expect(stored.conversation.client).toBeTruthy();
    expect(stored.conversation.lead).toBeTruthy();

    // The real inbox retrieval path, not a bespoke query.
    const inbox = await listConversations(biz, { view: "priority" });
    expect(inbox.rows.some((row) => row.id === stored.conversationId)).toBe(true);
    const byChannel = await listConversations(biz, { view: "all", channel: "INSTAGRAM" });
    expect(byChannel.rows.some((row) => row.id === stored.conversationId)).toBe(true);
    // The live-refresh counter moved, which is what makes it appear without a reload.
    expect((await prisma.business.findUniqueOrThrow({ where: { id: biz } })).inboxVersion).toBeGreaterThan(0);

    // A redelivery of the same event never doubles it.
    await processMetaEnvelope({ object: "instagram", entry: [{ id: PRO2, time: Date.now(), messaging: [{ sender: { id: sender }, recipient: { id: PRO2 }, timestamp: Date.now(), message: { mid, text: "Do you shoot weddings in June?" } }] }] });
    expect(await prisma.message.count({ where: { providerMessageId: mid } })).toBe(1);
  });
});
