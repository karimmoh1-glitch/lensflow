import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { ingestInboundMessage } from "@/server/leadIngestion";
import { getInboxVersion, watchInboxVersion } from "@/server/inboxSignal";
import { processMetaEnvelope } from "@/server/metaInbound";
import { syncInstagramForBusiness, checkInstagramSubscription } from "@/server/instagramSync";
import { reconcileBusiness } from "@/server/reconcile";
import { syncGmailForBusiness } from "@/server/gmailSync";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

/**
 * The sync guarantees, against the real database: a provider message is stored once however
 * many times or how concurrently it arrives; every message write moves the workspace's inbox
 * version (what the live stream watches) and nothing else's; Instagram reconciliation finds a
 * DM the webhook missed and never duplicates one it delivered; a dead token is reported as
 * "reconnect"; Gmail's history cursor is used and its expiry falls back to the window.
 */
type Recorded = { status: number; body: unknown };
let recorded: Recorded[] = [];
const requests: Array<{ url: string }> = [];
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

describe("sync reliability", () => {
  const ids: string[] = [];
  let a: string; let b: string;
  beforeAll(async () => {
    a = (await prisma.business.create({ data: { name: "Sync A", handle: `sync-a-${stamp()}` } })).id;
    b = (await prisma.business.create({ data: { name: "Sync B", handle: `sync-b-${stamp()}` } })).id;
    ids.push(a, b);
    vi.stubGlobal("fetch", async (url: string) => {
      requests.push({ url: String(url) });
      const next = recorded.shift() ?? { status: 200, body: {} };
      return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
    });
  });
  afterEach(() => { recorded = []; requests.length = 0; });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); vi.unstubAllGlobals(); });

  it("the same provider message, delivered five times at once, is stored once — and the database enforces it", async () => {
    const mid = `mid-${stamp()}`;
    const results = await Promise.all(Array.from({ length: 5 }, () => ingestInboundMessage({ businessId: a, channel: "INSTAGRAM", senderName: "Sam", senderHandle: "igsid_sam", body: "Are you free Saturday?", providerMessageId: mid })));
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(await prisma.message.count({ where: { providerMessageId: mid } })).toBe(1);
    // Straight to the table, bypassing the application check: the unique constraint refuses.
    const conv = results[0].conversation!;
    await expect(prisma.message.create({ data: { conversationId: conv.id, direction: "INBOUND", body: "dup", providerMessageId: mid } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("every message write bumps the owning workspace's inbox version, and only that workspace's", async () => {
    const va = await getInboxVersion(a); const vb = await getInboxVersion(b);
    await ingestInboundMessage({ businessId: a, channel: "SMS", senderName: "+15125550100", senderHandle: "+15125550100", clientPhone: "+15125550100", body: "hi there", providerMessageId: `SM${stamp()}` });
    expect(await getInboxVersion(a)).toBeGreaterThan(va);
    expect(await getInboxVersion(b)).toBe(vb);
    // A delivery receipt is a write too.
    const conv = await prisma.conversation.findFirst({ where: { businessId: a, channel: "SMS" } });
    const out = await prisma.message.create({ data: { conversationId: conv!.id, direction: "OUTBOUND", body: "On my way", status: "SENT", providerMessageId: `SM-out-${stamp()}` } });
    const v1 = await getInboxVersion(a);
    await prisma.message.update({ where: { id: out.id }, data: { status: "DELIVERED", statusDetail: "delivered" } });
    expect(await getInboxVersion(a)).toBeGreaterThan(v1);
  });

  it("the watcher yields when the version moves and stops at its deadline", async () => {
    const from = await getInboxVersion(a);
    const seen: number[] = [];
    const run = (async () => { for await (const v of watchInboxVersion(a, { everyMs: 60, maxMs: 1500, from })) seen.push(v); })();
    await new Promise((r) => setTimeout(r, 150));
    await ingestInboundMessage({ businessId: a, channel: "SMS", senderName: "+15125550101", senderHandle: "+15125550101", clientPhone: "+15125550101", body: "second", providerMessageId: `SM${stamp()}` });
    await run;
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen[seen.length - 1]).toBeGreaterThan(from);
  });

  it("a webhook DM and the same DM found by reconciliation are one message; a DM the webhook missed is recovered", async () => {
    const igId = `ig_${stamp()}`;
    await prisma.integration.create({ data: { businessId: a, provider: "INSTAGRAM", status: "CONNECTED", externalId: igId, externalAccount: "@a", accessToken: "IGAAtoken", lastSyncedAt: new Date(Date.now() - 3600e3), settings: { professionalAccountId: igId, username: "a" } } });
    const midWebhook = `mid_w_${stamp()}`; const midMissed = `mid_m_${stamp()}`;
    recorded = [{ status: 200, body: { username: "sarah.j", name: "Sarah" } }];
    await processMetaEnvelope({ object: "instagram", entry: [{ id: igId, time: 1, messaging: [{ sender: { id: "igsid_777" }, recipient: { id: igId }, timestamp: Date.now(), message: { mid: midWebhook, text: "Do you shoot weddings?" } }] }] });
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: a, provider: "INSTAGRAM" } } });
    expect(row?.lastWebhookAt).not.toBeNull();
    recorded = [{ status: 200, body: { data: [{ id: "conv1", participants: { data: [{ id: igId }, { id: "igsid_777", username: "sarah.j" }] }, messages: { data: [
      { id: midMissed, from: { id: "igsid_777" }, message: "And do you travel?", created_time: new Date().toISOString() },
      { id: midWebhook, from: { id: "igsid_777" }, message: "Do you shoot weddings?", created_time: new Date().toISOString() },
      { id: `mid_own_${stamp()}`, from: { id: igId }, message: "our own reply", created_time: new Date().toISOString() },
    ] } }] } }];
    const r = await syncInstagramForBusiness(a);
    expect(r).toMatchObject({ ok: true, found: 2, ingested: 1 });
    expect(await prisma.message.count({ where: { providerMessageId: { in: [midWebhook, midMissed] } } })).toBe(2);
    // Run it again with the same data: nothing new.
    recorded = [{ status: 200, body: { data: [{ id: "conv1", participants: { data: [{ id: igId }, { id: "igsid_777" }] }, messages: { data: [{ id: midMissed, from: { id: "igsid_777" }, message: "And do you travel?", created_time: new Date().toISOString() }] } }] } }];
    expect(await syncInstagramForBusiness(a)).toMatchObject({ ok: true, ingested: 0 });
  });

  it("a dead Instagram token flips the connection to reconnect instead of failing quietly; the subscription check records missing delivery", async () => {
    recorded = [{ status: 401, body: { error: { message: "Error validating access token", code: 190 } } }];
    const r = await syncInstagramForBusiness(a);
    expect(r.ok).toBe(false);
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: a, provider: "INSTAGRAM" } } });
    expect(row?.status).toBe("NEEDS_ATTENTION");
    expect(row?.lastError).toMatch(/reconnect/);
    await prisma.integration.update({ where: { id: row!.id }, data: { status: "CONNECTED", lastError: null } });
    // Not subscribed → resubscribe attempted → still not subscribed → recorded honestly.
    recorded = [{ status: 200, body: { data: [] } }, { status: 200, body: { success: true } }, { status: 200, body: { data: [{ subscribed_fields: ["comments"] }] } }];
    const check = await checkInstagramSubscription((await prisma.integration.findUnique({ where: { id: row!.id } }))!);
    expect(check.subscribed).toBe(false);
    const after = await prisma.integration.findUnique({ where: { id: row!.id } });
    expect((after?.settings as { webhooksSubscribed?: boolean }).webhooksSubscribed).toBe(false);
    expect(after?.lastError).toMatch(/isn't delivering/);
    // Subscribed → clean.
    recorded = [{ status: 200, body: { data: [{ subscribed_fields: ["messages"] }] } }];
    expect((await checkInstagramSubscription(after!)).subscribed).toBe(true);
  });

  it("reconciliation runs every connected channel once, throttled, and never crosses tenants", async () => {
    await prisma.integration.update({ where: { businessId_provider: { businessId: a, provider: "INSTAGRAM" } }, data: { lastSyncedAt: new Date(Date.now() - 120_000), lastSyncStatus: "ok" } });
    recorded = [{ status: 200, body: { data: [] } }];
    const first = await reconcileBusiness(a);
    expect(first.results.map((r) => r.provider)).toEqual(["INSTAGRAM"]);
    expect(first.results[0]).toMatchObject({ ok: true, ingested: 0 });
    const second = await reconcileBusiness(a);
    expect(second.results[0]).toMatchObject({ skipped: true });
    expect(requests.filter((r) => r.url.includes("/me/conversations"))).toHaveLength(1);
    expect((await reconcileBusiness(b)).results).toEqual([]);
  });

  it("Gmail: the history cursor names exactly the new messages; an expired cursor falls back to the window and a fresh cursor is stored", async () => {
    await prisma.integration.create({ data: { businessId: b, provider: "EMAIL", status: "CONNECTED", externalAccount: "b@gmail.com", refreshToken: "r", accessToken: "tok", tokenExpiresAt: new Date(Date.now() + 3600e3), syncCursor: "1000", lastSyncedAt: new Date(Date.now() - 3600e3) } });
    const msg = (id: string, subject: string) => ({ status: 200, body: { id, payload: { headers: [{ name: "From", value: "Maya Chen <maya@outlook.com>" }, { name: "Subject", value: subject }, { name: "Message-ID", value: `<${id}@mail>` }], mimeType: "text/plain", body: { data: Buffer.from("Hi, are you free in October?").toString("base64url") } } } });
    recorded = [{ status: 200, body: { history: [{ messagesAdded: [{ message: { id: "g1", labelIds: ["INBOX"] } }] }], historyId: "1005" } }, msg("g1", "October?"), { status: 200, body: { historyId: "1005" } }];
    const r1 = await syncGmailForBusiness(b);
    expect(r1).toMatchObject({ ok: true, ingested: 1 });
    expect(requests.some((r) => r.url.includes("/history?"))).toBe(true);
    expect((await prisma.integration.findUnique({ where: { businessId_provider: { businessId: b, provider: "EMAIL" } } }))?.syncCursor).toBe("1005");
    // Cursor expired (404) → time window → still fine, still idempotent.
    recorded = [{ status: 404, body: {} }, { status: 200, body: { messages: [{ id: "g1" }] } }, msg("g1", "October?"), { status: 200, body: { historyId: "1010" } }];
    const r2 = await syncGmailForBusiness(b);
    expect(r2).toMatchObject({ ok: true, ingested: 0 });
    expect(requests.some((r) => r.url.includes("q=in%3Ainbox"))).toBe(true);
    expect((await prisma.integration.findUnique({ where: { businessId_provider: { businessId: b, provider: "EMAIL" } } }))?.syncCursor).toBe("1010");
    expect(await prisma.message.count({ where: { conversation: { businessId: b }, providerMessageId: "<g1@mail>" } })).toBe(1);
  });
});
