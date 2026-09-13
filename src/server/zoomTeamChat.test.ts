import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db";

const jar = vi.hoisted(() => new Map<string, string>());
const current = vi.hoisted(() => ({ session: null as null | { userId: string; activeBusinessId: string } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-vercel-forwarded-for": "198.51.100.77" }),
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined), set: (k: string, v: string) => { jar.set(k, v); }, delete: (k: string) => { jar.delete(k); } }),
}));
vi.mock("@/lib/auth", async (importOriginal) => { const mod = await importOriginal<typeof import("@/lib/auth")>(); return { ...mod, getSession: async () => current.session }; });

import { signOAuthState } from "@/lib/integrations/oauthState";
import { ZOOM_SCOPES, ZOOM_MEETING_SCOPES, zoomChatSendGranted, verifyZoomSignature } from "@/lib/zoom";
import { sendReplyAction } from "@/app/actions/inbox";
import { handleZoomInboxPayload, parseZoomDmEvent } from "@/server/zoomChat";
import { webhookRetryHandlers } from "@/server/webhookHandlers";

/**
 * Zoom Team Chat direct messages, end to end against the real database with Zoom stubbed at
 * the network edge. Two workspaces with their own Zoom users in their own Zoom accounts, and
 * outside customers writing to them. What is proved: only signed events are read; the
 * workspace comes from the stored user AND account ids and nothing else; chats between
 * colleagues never reach the Inbox; each Zoom message is stored once; edits and deletes
 * follow the author; replies go out as the right user and are recorded once even when Zoom
 * echoes them first; missing chat permission and a reconnect behave; deauthorization still works.
 */
const stamp = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const SECRET = "zoom-team-chat-webhook-secret";

type Call = { method: string; url: string; auth: string | null; body: Record<string, unknown> };
let calls: Call[] = [];
let routes: Record<string, (c: Call) => Response | Promise<Response>> = {};
let sentSeq = 0;

describe("Zoom Team Chat DMs", () => {
  const businesses: string[] = [];
  const users: string[] = [];
  let POST: (req: Request) => Promise<Response>;
  let GET: (req: Request) => Promise<Response>;
  const s = stamp();
  const A = { user: `zA${s}`, account: `accA${s}`, email: `owner-a-${s}@zoom.example`, businessId: "", userId: "", session: { userId: "", activeBusinessId: "" } };
  const B = { user: `zB${s}`, account: `accB${s}`, email: `owner-b-${s}@zoom.example`, businessId: "", userId: "", session: { userId: "", activeBusinessId: "" } };
  const CUSTOMER = `jamie-${s}@customer.example`;

  const signed = (body: unknown, opts: { secret?: string; ts?: string; ip?: string } = {}) => {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    const ts = opts.ts ?? String(Date.now());
    const sig = `v0=${createHmac("sha256", opts.secret ?? SECRET).update(`v0:${ts}:${raw}`).digest("hex")}`;
    return new Request("http://localhost/api/webhooks/zoom", { method: "POST", body: raw, headers: { "content-type": "application/json", "x-zm-signature": sig, "x-zm-request-timestamp": ts, "x-vercel-forwarded-for": opts.ip ?? "203.0.113.9" } });
  };

  /** A DM event as Zoom documents it. `from` is who wrote; external senders have blank ids. */
  const dm = (event: "posted" | "updated" | "deleted", o: { owner: typeof A; fromOwner: boolean; messageId: string; text?: string; ts?: number; contactEmail?: string; ownerAccount?: string; internal?: boolean }) => {
    const ts = o.ts ?? Date.now();
    const other = o.contactEmail ?? CUSTOMER;
    const acct = o.ownerAccount ?? o.owner.account;
    const payload = o.fromOwner
      ? { account_id: acct, operator: o.owner.email, operator_id: o.owner.user, operator_member_id: "m-owner", by_external_user: false, object: { message_id: o.messageId, session_id: "sess", date_time: new Date(ts).toISOString(), timestamp: ts, contact_email: other, contact_id: o.internal ? "colleague-id" : "", contact_account_id: o.internal ? acct : "", contact_member_id: "m-contact", ...(event !== "deleted" ? { message: o.text ?? "hello" } : {}) } }
      : { account_id: "", operator: other, operator_id: "", operator_member_id: "m-customer", by_external_user: true, object: { message_id: o.messageId, session_id: "sess", date_time: new Date(ts).toISOString(), timestamp: ts, contact_email: o.owner.email, contact_id: o.owner.user, contact_account_id: acct, contact_member_id: "m-owner", ...(event !== "deleted" ? { message: o.text ?? "Hi, are you free Friday for a consultation?" } : {}) } };
    return { event: `team_chat.dm_message_${event}`, event_ts: ts, payload };
  };

  const zoomConversation = (businessId: string) => prisma.conversation.findFirst({ where: { businessId, channel: "ZOOM" }, include: { messages: { orderBy: { createdAt: "asc" } }, lead: true, client: true } });

  async function workspace(w: typeof A, name: string, scopes = ZOOM_SCOPES.join(" ")) {
    const biz = await prisma.business.create({ data: { name, handle: `${name.toLowerCase().replace(/\W+/g, "-")}-${s}`, planTier: "PRO", billingStatus: "ACTIVE" } });
    const user = await prisma.user.create({ data: { name: `${name} Owner`, email: `${name.toLowerCase().replace(/\W+/g, "-")}-${s}@example.test`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: user.id, businessId: biz.id, role: "OWNER" } });
    await prisma.integration.create({ data: { businessId: biz.id, provider: "ZOOM", status: "CONNECTED", externalId: w.user, externalAccount: w.email, accessToken: `at-${w.user}`, refreshToken: `rt-${w.user}`, tokenExpiresAt: new Date(Date.now() + 3600_000), scopes, settings: { accountId: w.account, name } } });
    businesses.push(biz.id);
    users.push(user.id);
    w.businessId = biz.id;
    w.userId = user.id;
    w.session = { userId: user.id, activeBusinessId: biz.id };
  }

  beforeAll(async () => {
    vi.stubEnv("ZOOM_CLIENT_ID", "zoom-client-id");
    vi.stubEnv("ZOOM_CLIENT_SECRET", "zoom-client-secret-value");
    vi.stubEnv("ZOOM_WEBHOOK_SECRET_TOKEN", SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://daythread.org");
    await workspace(A, "Chat One");
    await workspace(B, "Chat Two");
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers as HeadersInit | undefined);
      const raw = init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? "");
      const body = raw.startsWith("{") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
      const call = { method, url, auth: headers.get("authorization"), body };
      calls.push(call);
      const handler = routes[`${method} ${url.split("?")[0]}`];
      return handler ? handler(call) : json({ code: 404, message: "no stub" }, 404);
    });
    ({ POST } = await import("@/app/api/webhooks/zoom/route"));
    ({ GET } = await import("@/app/api/auth/zoom/callback/route"));
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.business.deleteMany({ where: { id: { in: businesses } } });
  });
  beforeEach(() => {
    calls = [];
    jar.clear();
    current.session = null;
    routes = {
      "POST https://api.zoom.us/v2/chat/users/me/messages": () => json({ id: `sent-${++sentSeq}-${s}` }, 201),
      "POST https://zoom.us/oauth/revoke": () => json({ status: "success" }),
    };
  });

  // ── the door ────────────────────────────────────────────────────────────────

  it("reads nothing that isn't signed with the webhook secret, in the exact v0 format, within five minutes", async () => {
    const evt = dm("posted", { owner: A, fromOwner: false, messageId: `forged-${s}` });
    expect((await POST(signed(evt, { secret: "wrong" }))).status).toBe(401);
    expect((await POST(signed(evt, { ts: String(Date.now() - 10 * 60_000) }))).status).toBe(401);
    const unsigned = new Request("http://localhost/api/webhooks/zoom", { method: "POST", body: JSON.stringify(evt), headers: { "content-type": "application/json", "x-zm-request-timestamp": String(Date.now()), "x-zm-signature": "v0=" + "A".repeat(64) } });
    expect((await POST(unsigned)).status).toBe(401);
    const raw = JSON.stringify(evt);
    const ts = String(Date.now());
    const good = createHmac("sha256", SECRET).update(`v0:${ts}:${raw}`).digest("hex");
    expect(verifyZoomSignature(raw, `v0=${good}`, ts)).toBe(true);
    expect(verifyZoomSignature(raw, `v0=${good.toUpperCase()}`, ts)).toBe(false);
    expect(verifyZoomSignature(raw, `v0=${good}`, `${ts}0000`)).toBe(false);
    expect(await prisma.message.count({ where: { providerMessageId: `forged-${s}` } })).toBe(0);
  });

  it("throttles repeated bad signatures from one address, never signed deliveries", async () => {
    const evt = dm("posted", { owner: A, fromOwner: false, messageId: `spray-${s}` });
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await POST(signed(evt, { secret: "wrong", ip: "192.0.2.200" }))).status;
    expect(last).toBe(429);
    // Zoom's own signed traffic from the same address is unaffected.
    expect((await POST(signed(dm("posted", { owner: B, fromOwner: false, messageId: `after-spray-${s}`, contactEmail: `other-${s}@customer.example` }), { ip: "192.0.2.200" }))).status).toBe(200);
  });

  it("refuses a signed but malformed DM payload, and acknowledges events Daythread doesn't handle without storing them", async () => {
    expect((await POST(signed({ event: "team_chat.dm_message_posted", event_ts: Date.now(), payload: { object: {} } }))).status).toBe(400);
    const bad = dm("posted", { owner: A, fromOwner: false, messageId: "../../etc" });
    expect((await POST(signed(bad))).status).toBe(400);
    for (const event of ["team_chat.channel_message_posted", "meeting.chat_message_sent", "chat_message.sent"]) {
      const r = await POST(signed({ event, event_ts: Date.now(), payload: { account_id: A.account, object: { message_id: `x-${event}`, message: "should not be stored" } } }));
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ ignored: event });
    }
    expect(await prisma.message.count({ where: { body: "should not be stored" } })).toBe(0);
  });

  // ── inbound ─────────────────────────────────────────────────────────────────

  it("a customer's DM lands in the right workspace's Inbox as a Zoom conversation with a client and a lead", async () => {
    const r = await POST(signed(dm("posted", { owner: A, fromOwner: false, messageId: `m1-${s}` })));
    expect(r.status).toBe(200);
    const conv = await zoomConversation(A.businessId);
    expect(conv).not.toBeNull();
    expect(conv!.externalHandle).toBe(CUSTOMER);
    expect(conv!.category).toBe("PRIORITY");
    expect(conv!.client?.email).toBe(CUSTOMER);
    expect(conv!.lead).not.toBeNull();
    expect(conv!.messages).toHaveLength(1);
    expect(conv!.messages[0]).toMatchObject({ direction: "INBOUND", providerMessageId: `m1-${s}`, body: "Hi, are you free Friday for a consultation?" });
    expect(await prisma.conversation.count({ where: { businessId: B.businessId, channel: "ZOOM", externalHandle: CUSTOMER } })).toBe(0);
    expect((await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: A.businessId, provider: "ZOOM" } } })).lastWebhookAt).not.toBeNull();
    // A second message from the same person continues the same conversation.
    await POST(signed(dm("posted", { owner: A, fromOwner: false, messageId: `m2-${s}`, text: "Or Saturday?" })));
    expect((await zoomConversation(A.businessId))!.messages.map((m) => m.body)).toEqual(["Hi, are you free Friday for a consultation?", "Or Saturday?"]);
  });

  it("the same Zoom message is stored once, however many times or ways Zoom delivers it", async () => {
    const evt = dm("posted", { owner: A, fromOwner: false, messageId: `dup-${s}`, text: "Once only" });
    expect((await POST(signed(evt))).status).toBe(200);
    expect(await (await POST(signed(evt))).json()).toMatchObject({ duplicate: true });
    // A redelivery Zoom stamps with a new event time is a new event id but the same message.
    await POST(signed({ ...evt, event_ts: evt.event_ts + 5000 }));
    await Promise.all(Array.from({ length: 5 }, (_, i) => POST(signed({ ...evt, event_ts: evt.event_ts + 10_000 + i }))));
    expect(await prisma.message.count({ where: { providerMessageId: `dup-${s}`, conversation: { businessId: A.businessId } } })).toBe(1);
  });

  it("cannot cross workspaces: the right user id with the wrong account id, or an unknown user, stores nothing", async () => {
    const before = await prisma.message.count({ where: { conversation: { channel: "ZOOM", businessId: { in: [A.businessId, B.businessId] } } } });
    // A's Zoom user id, but the account id is B's: matches no connection.
    const wrongAccount = await POST(signed(dm("posted", { owner: A, fromOwner: false, messageId: `cross-${s}`, ownerAccount: B.account })));
    expect(await wrongAccount.json()).toMatchObject({ ignored: "unknown_connection" });
    const nobody = await POST(signed(dm("posted", { owner: { ...A, user: "nobody", account: "nowhere" }, fromOwner: false, messageId: `nobody-${s}` })));
    expect(await nobody.json()).toMatchObject({ ignored: "unknown_connection" });
    expect(await prisma.message.count({ where: { conversation: { channel: "ZOOM", businessId: { in: [A.businessId, B.businessId] } } } })).toBe(before);
  });

  it("chats between colleagues in the same Zoom account never reach the Inbox", async () => {
    // The owner writing to a colleague.
    const out = await POST(signed(dm("posted", { owner: A, fromOwner: true, messageId: `int1-${s}`, internal: true, contactEmail: `colleague-${s}@a.example` })));
    expect(await out.json()).toMatchObject({ ignored: "internal_contact" });
    // A colleague (not connected) writing to the owner.
    const colleague = { account_id: A.account, operator: `colleague-${s}@a.example`, operator_id: "colleague-id", operator_member_id: "m", by_external_user: false, object: { message_id: `int2-${s}`, session_id: "x", timestamp: Date.now(), contact_email: A.email, contact_id: A.user, contact_account_id: A.account, message: "Lunch?" } };
    const inn = await POST(signed({ event: "team_chat.dm_message_posted", event_ts: Date.now(), payload: colleague }));
    expect(await inn.json()).toMatchObject({ ignored: "internal_contact" });
    expect(await prisma.message.count({ where: { providerMessageId: { in: [`int1-${s}`, `int2-${s}`] } } })).toBe(0);
  });

  // ── the owner's own messages ────────────────────────────────────────────────

  it("a message the owner types in Zoom joins the existing thread as sent in Zoom; a brand-new chat from the owner opens nothing", async () => {
    await POST(signed(dm("posted", { owner: A, fromOwner: true, messageId: `own1-${s}`, text: "Friday at 2 works!" })));
    const conv = await zoomConversation(A.businessId);
    const own = conv!.messages.find((m) => m.providerMessageId === `own1-${s}`);
    expect(own).toMatchObject({ direction: "OUTBOUND", status: "SENT", statusDetail: "sent_in_zoom", sentByUserId: null });
    expect(conv!.lead?.respondedAt).not.toBeNull();
    const fresh = await POST(signed(dm("posted", { owner: A, fromOwner: true, messageId: `own2-${s}`, contactEmail: `stranger-${s}@customer.example` })));
    expect(await fresh.json()).toMatchObject({ ignored: "no_thread" });
    expect(await prisma.conversation.count({ where: { businessId: A.businessId, externalHandle: `stranger-${s}@customer.example` } })).toBe(0);
  });

  // ── edits and deletes ───────────────────────────────────────────────────────

  it("an edit replaces the text, marks it edited and drops cached summaries; an older edit arriving late is ignored", async () => {
    const id = `edit-${s}`;
    const t0 = Date.now();
    await POST(signed(dm("posted", { owner: A, fromOwner: false, messageId: id, text: "Budget is $500", ts: t0 })));
    const row = await prisma.message.findFirstOrThrow({ where: { providerMessageId: id } });
    await prisma.message.update({ where: { id: row.id }, data: { summary: "old summary", summaryAt: new Date(), summarySource: "rules" } });
    await POST(signed(dm("updated", { owner: A, fromOwner: false, messageId: id, text: "Budget is $800", ts: t0 + 2000 })));
    let after = await prisma.message.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ body: "Budget is $800", summary: null, summaryAt: null });
    expect(after.editedAt?.getTime()).toBe(t0 + 2000);
    const late = await POST(signed(dm("updated", { owner: A, fromOwner: false, messageId: id, text: "Budget is $600", ts: t0 + 1000 })));
    expect(await late.json()).toMatchObject({ ignored: "stale_edit" });
    after = await prisma.message.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.body).toBe("Budget is $800");
  });

  it("only the author's side can edit or delete, and a message id from another workspace is never touched", async () => {
    const id = `author-${s}`;
    await POST(signed(dm("posted", { owner: A, fromOwner: false, messageId: id, text: "Customer words" })));
    // The owner cannot rewrite the customer's message.
    const byOwner = await POST(signed(dm("updated", { owner: A, fromOwner: true, messageId: id, text: "Rewritten by owner" })));
    expect(await byOwner.json()).toMatchObject({ ignored: "author_mismatch" });
    // Workspace B's owner naming A's message id finds nothing in B.
    const fromB = await POST(signed(dm("deleted", { owner: B, fromOwner: false, messageId: id })));
    expect(await fromB.json()).toMatchObject({ ignored: "not_found" });
    const row = await prisma.message.findFirstOrThrow({ where: { providerMessageId: id } });
    expect(row).toMatchObject({ body: "Customer words", deletedAt: null });
    // Edits for a message never stored are ignored, not invented.
    expect(await (await POST(signed(dm("updated", { owner: A, fromOwner: false, messageId: `never-${s}` })))).json()).toMatchObject({ ignored: "not_found" });
  });

  it("a delete removes the words and keeps the row; later edits don't bring it back", async () => {
    const id = `del-${s}`;
    await POST(signed(dm("posted", { owner: A, fromOwner: false, messageId: id, text: "My address is 1 Private Lane" })));
    const r = await POST(signed(dm("deleted", { owner: A, fromOwner: false, messageId: id })));
    expect(r.status).toBe(200);
    const row = await prisma.message.findFirstOrThrow({ where: { providerMessageId: id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.body).toBe("Message deleted in Zoom.");
    expect(row.rawBody).toBeNull();
    const revive = await POST(signed(dm("updated", { owner: A, fromOwner: false, messageId: id, text: "back again", ts: Date.now() + 5000 })));
    expect(await revive.json()).toMatchObject({ ignored: "already_deleted" });
    expect(await prisma.auditLog.count({ where: { businessId: A.businessId, action: "message.deleted_by_provider", targetId: row.id } })).toBe(1);
  });

  // ── replies ─────────────────────────────────────────────────────────────────

  it("a reply goes out as A's Zoom user to the customer's recorded address, and is recorded once even after Zoom echoes it", async () => {
    const conv = (await zoomConversation(A.businessId))!;
    const result = await sendReplyAction(conv.id, "See you Friday at 2.", false, A.session);
    expect(result).toMatchObject({ ok: true, simulated: false });
    const send = calls.find((c) => c.url === "https://api.zoom.us/v2/chat/users/me/messages");
    expect(send?.auth).toBe(`Bearer at-${A.user}`);
    expect(send?.body).toEqual({ message: "See you Friday at 2.", to_contact: CUSTOMER });
    const sentId = (result as { providerMessageId: string }).providerMessageId;
    // Zoom reports the same message on the webhook.
    const echo = await POST(signed(dm("posted", { owner: A, fromOwner: true, messageId: sentId, text: "See you Friday at 2." })));
    expect(await echo.json()).toMatchObject({ duplicate: true });
    const rows = await prisma.message.findMany({ where: { providerMessageId: sentId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ direction: "OUTBOUND", status: "SENT", sentByUserId: A.userId });
  });

  it("when Zoom's echo lands before the reply is recorded, the thread still holds one message, credited to the sender", async () => {
    const conv = (await zoomConversation(A.businessId))!;
    routes["POST https://api.zoom.us/v2/chat/users/me/messages"] = async (c) => {
      const id = `raced-${s}`;
      await POST(signed(dm("posted", { owner: A, fromOwner: true, messageId: id, text: String(c.body.message) })));
      return json({ id }, 201);
    };
    const result = await sendReplyAction(conv.id, "Racing the echo", false, A.session);
    expect(result).toMatchObject({ ok: true });
    const rows = await prisma.message.findMany({ where: { providerMessageId: `raced-${s}` } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sentByUserId: A.userId, statusDetail: null });
  });

  it("another workspace, a client login, or no session can't reply on A's Zoom conversation", async () => {
    const conv = (await zoomConversation(A.businessId))!;
    calls = [];
    await expect(sendReplyAction(conv.id, "not yours", false, B.session)).rejects.toThrow(/not found/);
    await expect(sendReplyAction(conv.id, "no session", false, null)).rejects.toThrow(/unauthorized/);
    const client = await prisma.user.create({ data: { name: "Client", email: `client-${s}@example.test`, passwordHash: "x" } });
    users.push(client.id);
    await prisma.orgMembership.create({ data: { userId: client.id, businessId: A.businessId, role: "CLIENT" } });
    await expect(sendReplyAction(conv.id, "client", false, { userId: client.id, activeBusinessId: A.businessId })).rejects.toThrow(/unauthorized/);
    expect(calls.filter((c) => c.url.includes("/chat/"))).toHaveLength(0);
  });

  it("without the chat permission, with an over-long reply, or when Zoom refuses, nothing is claimed as sent", async () => {
    const conv = (await zoomConversation(A.businessId))!;
    const row = await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: A.businessId, provider: "ZOOM" } } });
    await prisma.integration.update({ where: { id: row.id }, data: { scopes: ZOOM_MEETING_SCOPES.join(" ") } });
    calls = [];
    expect(await sendReplyAction(conv.id, "needs scope", false, A.session)).toMatchObject({ ok: true, simulated: true });
    expect(calls).toHaveLength(0);
    await prisma.integration.update({ where: { id: row.id }, data: { scopes: ZOOM_SCOPES.join(" ") } });

    expect(await sendReplyAction(conv.id, "x".repeat(1025), false, A.session)).toMatchObject({ ok: true, simulated: true });
    expect(calls).toHaveLength(0);

    routes["POST https://api.zoom.us/v2/chat/users/me/messages"] = () => json({ code: 4711, message: "Invalid access token, does not contain scopes:[team_chat:write:user_message]." }, 403);
    const refused = await sendReplyAction(conv.id, "refused", false, A.session);
    expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/reconnect zoom/i) });
    expect(JSON.stringify(refused)).not.toContain("Invalid access token");
    const after = await prisma.integration.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe("NEEDS_ATTENTION");
    const statuses = await prisma.message.findMany({ where: { conversationId: conv.id, body: { in: ["needs scope", "x".repeat(1025), "refused"] } }, select: { status: true } });
    expect(statuses.map((m) => m.status).sort()).toEqual(["FAILED", "NOT_DELIVERED", "NOT_DELIVERED"]);
    // A connection needing attention still receives customers' messages.
    await POST(signed(dm("posted", { owner: A, fromOwner: false, messageId: `while-na-${s}`, text: "Still there?" })));
    expect(await prisma.message.count({ where: { providerMessageId: `while-na-${s}` } })).toBe(1);
  });

  it("reconnecting after the chat scopes were added updates the same connection's grant and turns replies back on", async () => {
    const row = await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: A.businessId, provider: "ZOOM" } } });
    await prisma.integration.update({ where: { id: row.id }, data: { scopes: ZOOM_MEETING_SCOPES.join(" "), status: "NEEDS_ATTENTION" } });
    expect(zoomChatSendGranted(ZOOM_MEETING_SCOPES.join(" "))).toBe(false);
    routes["POST https://zoom.us/oauth/token"] = () => json({ access_token: "at-reconnected", refresh_token: "rt-reconnected", expires_in: 3599, scope: ZOOM_SCOPES.join(" ") });
    routes["GET https://api.zoom.us/v2/users/me"] = () => json({ id: A.user, account_id: A.account, email: A.email, display_name: "Owner A" });
    const state = await signOAuthState({ provider: "zoom", purpose: "meetings", businessId: A.businessId, userId: A.userId });
    jar.set("zoom_oauth_pkce", "v".repeat(64));
    current.session = A.session;
    const res = await GET(new Request(`http://localhost/api/auth/zoom/callback?code=re&state=${encodeURIComponent(state)}`));
    expect(res.headers.get("location")).toContain("connected=ZOOM");
    const after = await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: A.businessId, provider: "ZOOM" } } });
    expect(after.id).toBe(row.id);
    expect(after.status).toBe("CONNECTED");
    expect(after.accessToken).toBe("at-reconnected");
    expect(zoomChatSendGranted(after.scopes)).toBe(true);
    expect(after.settings).toMatchObject({ accountId: A.account });
    // Replies work again with the new token; the old grant was handed back.
    const conv = (await zoomConversation(A.businessId))!;
    expect(await sendReplyAction(conv.id, "Back online", false, A.session)).toMatchObject({ ok: true, simulated: false });
    expect(calls.find((c) => c.url.endsWith("/chat/users/me/messages"))?.auth).toBe("Bearer at-reconnected");
    expect(calls.some((c) => c.url === "https://zoom.us/oauth/revoke" && c.body.token === `at-${A.user}`)).toBe(true);
  });

  // ── deauthorization and replays ─────────────────────────────────────────────

  it("a failed DM delivery is replayed by the daily run through the stored payload", async () => {
    const evt = parseZoomDmEvent(dm("posted", { owner: B, fromOwner: false, messageId: `replay-${s}`, text: "Replayed", contactEmail: `replay-${s}@customer.example` }))!;
    await webhookRetryHandlers().zoom({ kind: "dm", event: evt });
    expect(await prisma.message.count({ where: { providerMessageId: `replay-${s}`, conversation: { businessId: B.businessId } } })).toBe(1);
    await handleZoomInboxPayload({ kind: "dm", event: evt });
    expect(await prisma.message.count({ where: { providerMessageId: `replay-${s}` } })).toBe(1);
  });

  it("App Deauthorized still erases only the matching connection, and chat events for it stop being stored", async () => {
    const body = { event: "app_deauthorized", event_ts: Date.now(), payload: { account_id: B.account, user_id: B.user, signature: `sig-${s}`, deauthorization_time: new Date().toISOString(), client_id: "zoom-client-id" } };
    expect((await POST(signed(body))).status).toBe(200);
    const b = await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: B.businessId, provider: "ZOOM" } } });
    expect(b).toMatchObject({ status: "NOT_CONNECTED", accessToken: null, refreshToken: null, externalId: null });
    expect((await prisma.integration.findUniqueOrThrow({ where: { businessId_provider: { businessId: A.businessId, provider: "ZOOM" } } })).status).toBe("CONNECTED");
    expect(await (await POST(signed(body))).json()).toMatchObject({ duplicate: true });
    // Legacy rows written before chat support replay as deauthorizations.
    await expect(handleZoomInboxPayload({ userId: "nobody", accountId: "nowhere" })).resolves.toBeUndefined();
    const after = await POST(signed(dm("posted", { owner: B, fromOwner: false, messageId: `post-deauth-${s}`, contactEmail: `late-${s}@customer.example` })));
    expect(await after.json()).toMatchObject({ ignored: "unknown_connection" });
  });
});
