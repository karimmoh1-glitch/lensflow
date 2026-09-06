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
  it("brakes a script that keeps forging signatures from one address", async () => {
    const raw = JSON.stringify({ object: "instagram", entry: [] });
    const attempt = () => POST(new Request("http://localhost/api/webhooks/meta", { method: "POST", body: raw, headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64), "x-forwarded-for": "192.0.2.77" } }));
    const codes: number[] = [];
    for (let i = 0; i < 24; i++) codes.push((await attempt()).status);
    expect(codes.filter((c) => c === 401).length).toBeGreaterThan(0);
    expect(codes[codes.length - 1]).toBe(429);
    // A correctly signed delivery from a different address is unaffected.
    expect((await post({ object: "instagram", entry: [] })).status).toBe(200);
  });

  it("rejects a forged signature that is the right length but not hex, with 401 and not a 500", async () => {
    // The regression: Buffer.from(…, "hex") truncates at the first bad character, which made
    // the constant-time compare throw and turned a forged request into a 500 Meta retries.
    const raw = JSON.stringify({ object: "instagram", entry: [] });
    // Each probe comes from its own address so the per-IP brake (which is what a real
    // forging script would hit) doesn't turn a later assertion into a 429.
    let ip = 0;
    const forged = (sig: string) => POST(new Request("http://localhost/api/webhooks/meta", { method: "POST", body: raw, headers: { "x-hub-signature-256": sig, "x-forwarded-for": `198.51.100.${++ip}` } }));
    expect((await forged("sha256=" + "z".repeat(64))).status).toBe(401);
    expect((await forged("sha256=" + "0z".repeat(32))).status).toBe(401);
    expect((await forged("sha256=" + "0".repeat(63) + "!")).status).toBe(401);
    expect((await forged("sha256=")).status).toBe(401);
    expect((await forged("garbage")).status).toBe(401);
    expect((await POST(new Request("http://localhost/api/webhooks/meta", { method: "POST", body: raw, headers: { "x-forwarded-for": "198.51.100.200" } }))).status).toBe(401);
  });

  it("rejects a body modified after signing", async () => {
    const original = JSON.stringify({ object: "instagram", entry: [{ id: igA, messaging: [] }] });
    const tampered = JSON.stringify({ object: "instagram", entry: [{ id: "ig_someone_else", messaging: [] }] });
    const r = await POST(new Request("http://localhost/api/webhooks/meta", { method: "POST", body: tampered, headers: { "x-hub-signature-256": sign(original), "x-forwarded-for": "203.0.113.9" } }));
    expect(r.status).toBe(401);
  });

  it("refuses a WhatsApp event that only the Instagram secret signed", async () => {
    // WhatsApp Business Account events are signed by the Meta app that owns the
    // subscription. One product's secret must never be able to inject into the other.
    vi.stubEnv("INSTAGRAM_APP_SECRET", "instagram_app_secret_test");
    const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: waB }, messages: [{ from: "15550009999", id: `wamid.forged_${Date.now()}`, type: "text", text: { body: "injected" } }] } }] }] });
    const igSigned = "sha256=" + createHmac("sha256", "instagram_app_secret_test").update(raw).digest("hex");
    const r = await POST(new Request("http://localhost/api/webhooks/meta", { method: "POST", body: raw, headers: { "x-hub-signature-256": igSigned, "x-forwarded-for": "203.0.113.10" } }));
    expect(r.status).toBe(401);
    expect(await prisma.conversation.count({ where: { businessId: bId, externalHandle: "+15550009999" } })).toBe(0);
    vi.stubEnv("INSTAGRAM_APP_SECRET", "");
  });

  it("refuses a payload far larger than Meta ever sends", async () => {
    const raw = JSON.stringify({ object: "instagram", entry: [], pad: "x".repeat(1_100_000) });
    const r = await POST(new Request("http://localhost/api/webhooks/meta", { method: "POST", body: raw, headers: { "x-hub-signature-256": sign(raw) } }));
    expect(r.status).toBe(413);
  });

  it("acknowledges a well-formed event for an object it doesn't handle", async () => {
    const r = await post({ object: "page", entry: [{ id: "page_1" }] });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ handled: 0 });
  });

  it("rejects malformed shapes that are correctly signed", async () => {
    for (const body of [{ object: "instagram" }, { entry: [] }, { object: 5, entry: [] }, { object: "instagram", entry: "not-an-array" }]) {
      const raw = JSON.stringify(body);
      const r = await POST(new Request("http://localhost/api/webhooks/meta", { method: "POST", body: raw, headers: { "x-hub-signature-256": sign(raw) } }));
      expect(r.status).toBe(400);
    }
  });

  it("ignores a WhatsApp message for a phone number nobody has connected, and writes nothing", async () => {
    const before = await prisma.conversation.count();
    const r = await post({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: "pn_never_connected" }, contacts: [{ wa_id: "15550008888", profile: { name: "Nobody" } }], messages: [{ from: "15550008888", id: `wamid.unknown_${Date.now()}`, type: "text", text: { body: "hello?" } }] } }] }] });
    expect(await r.json()).toMatchObject({ handled: 0 });
    expect(await prisma.conversation.count()).toBe(before);
  });

  it("ignores an Instagram DM for an account whose integration has been disconnected", async () => {
    await prisma.integration.updateMany({ where: { businessId: aId, provider: "INSTAGRAM" }, data: { status: "NOT_CONNECTED" } });
    const mid = `mid_disconnected_${Date.now()}`;
    const r = await post({ object: "instagram", entry: [{ id: igA, messaging: [{ sender: { id: "igsid_888" }, recipient: { id: igA }, message: { mid, text: "still there?" } }] }] });
    expect(await r.json()).toMatchObject({ handled: 0 });
    expect(await prisma.message.count({ where: { providerMessageId: mid } })).toBe(0);
    await prisma.integration.updateMany({ where: { businessId: aId, provider: "INSTAGRAM" }, data: { status: "CONNECTED" } });
  });

  it("applies a read receipt and never rolls a status backwards", async () => {
    const client = await prisma.client.create({ data: { businessId: bId, name: "WA Read", phone: "+15550003333" } });
    const conv = await prisma.conversation.create({ data: { businessId: bId, clientId: client.id, channel: "WHATSAPP", externalHandle: "+15550003333", lastMessageAt: new Date() } });
    const id = `wamid.read_${Date.now()}`;
    const msg = await prisma.message.create({ data: { conversationId: conv.id, direction: "OUTBOUND", body: "On my way", status: "SENT", providerMessageId: id } });
    const status = (s: string, ts: string) => post({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: waB }, statuses: [{ id, status: s, timestamp: ts }] } }] }] });
    await status("delivered", "1788600000");
    await status("read", "1788600060");
    const read = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(read?.status).toBe("DELIVERED");
    expect(read?.statusDetail).toBe("read");
    expect(read?.readAt).toBeTruthy();
    expect(read?.deliveredAt).toBeTruthy();
    // Meta can redeliver an earlier status; it must not un-read the message.
    await status("sent", "1788599000");
    await status("delivered", "1788599500");
    const after = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(after?.statusDetail).toBe("read");
    expect(after?.readAt?.getTime()).toBe(read?.readAt?.getTime());
  });

  it("acknowledges an account-level WhatsApp change without treating it as a message", async () => {
    const r = await post({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "account_update", value: { phone_number: "+1555", event: "VERIFIED_ACCOUNT" } }] }] });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ handled: 0 });
  });

  it("normalizes a WhatsApp image with a caption instead of dropping the message", async () => {
    const id = `wamid.media_${Date.now()}`;
    await post({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: waB }, contacts: [{ wa_id: "15550004444", profile: { name: "Mia" } }], messages: [{ from: "15550004444", id, type: "image", image: { id: "media123", caption: "Is this the right dress?" } }] } }] }] });
    const message = await prisma.message.findFirst({ where: { providerMessageId: id } });
    expect(message?.body).toBe("[image] Is this the right dress?");
  });

  it("reads an Instagram DM delivered under the changes shape as well as the messaging shape", async () => {
    const mid = `mid_changes_${Date.now()}`;
    await post({ object: "instagram", entry: [{ id: igA, changes: [{ field: "messages", value: { messaging: [{ sender: { id: "igsid_999" }, recipient: { id: igA }, message: { mid, text: "Do you shoot weddings?" } }] } }] }] });
    const message = await prisma.message.findFirst({ where: { providerMessageId: mid, conversation: { businessId: aId } } });
    expect(message?.body).toBe("Do you shoot weddings?");
  });

  it("answers the handshake only for a subscribe with a challenge", async () => {
    expect((await GET(new Request("http://localhost/api/webhooks/meta?hub.mode=unsubscribe&hub.verify_token=verify-me&hub.challenge=1"))).status).toBe(403);
    expect((await GET(new Request("http://localhost/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me"))).status).toBe(403);
    expect((await GET(new Request("http://localhost/api/webhooks/meta"))).status).toBe(403);
  });
});
