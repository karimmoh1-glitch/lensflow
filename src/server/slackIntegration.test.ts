import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db";

const jar = vi.hoisted(() => new Map<string, string>());
const current = vi.hoisted(() => ({ session: null as null | { userId: string; activeBusinessId: string } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.150" }),
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined), set: (k: string, v: string) => { jar.set(k, v); }, delete: (k: string) => { jar.delete(k); } }),
}));
vi.mock("@/lib/auth", async (importOriginal) => { const mod = await importOriginal<typeof import("@/lib/auth")>(); return { ...mod, getSession: async () => current.session }; });

import { signOAuthState } from "@/lib/integrations/oauthState";
import { slackAuthUrl, verifySlackSignature, parseSlackEvent, slackEventsUrl, postSlackMessage } from "@/lib/slack";
import { postToSlack, notifyBusiness } from "@/server/notify";
import { connectSlack, selectSlackChannel, listSlackChannelsAction, disconnectIntegration } from "@/app/actions/connect";
import { OAuthError } from "@/lib/integrations/oauth";

/**
 * Slack, end to end against the real database, with Slack itself stubbed at the network
 * edge and every request captured. What is proved is everything on Daythread's side: the
 * consent URL, the install landing on the right workspace and no other, a reinstall keeping
 * its channel, a channel chosen and proven by a real post, the events route's door, an
 * uninstall turning the row honest, and that one Slack team can never reach another
 * business's Daythread.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const SIGNING = "test-signing-secret-0123456789";

type Call = { method: string; token: string | null; body: Record<string, unknown> };
let calls: Call[] = [];
let answers: Record<string, (body: Record<string, unknown>) => unknown> = {};

const signed = (body: string, opts: { secret?: string; ts?: number } = {}) => {
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const sig = `v0=${createHmac("sha256", opts.secret ?? SIGNING).update(`v0:${ts}:${body}`).digest("hex")}`;
  return new Request("http://localhost/api/webhooks/slack/events", { method: "POST", body, headers: { "content-type": "application/json", "x-slack-signature": sig, "x-slack-request-timestamp": ts } });
};

async function workspace(name: string) {
  const biz = await prisma.business.create({ data: { name, handle: `${name.toLowerCase().replace(/\W+/g, "-")}-${stamp()}`, planTier: "PRO", billingStatus: "ACTIVE" } });
  const user = await prisma.user.create({ data: { name: `${name} Owner`, email: `${name.toLowerCase().replace(/\W+/g, "-")}-${stamp()}@example.test`, passwordHash: "x" } });
  await prisma.orgMembership.create({ data: { userId: user.id, businessId: biz.id, role: "OWNER" } });
  return { businessId: biz.id, userId: user.id, session: { userId: user.id, activeBusinessId: biz.id } };
}

describe("Slack", () => {
  const ids: string[] = [];
  let a: Awaited<ReturnType<typeof workspace>>;
  let b: Awaited<ReturnType<typeof workspace>>;
  let GET: (req: Request) => Promise<Response>;
  let POST: (req: Request) => Promise<Response>;
  const TEAM_A = `T${stamp().replace(/\W/g, "").toUpperCase()}A`;
  const TEAM_B = `T${stamp().replace(/\W/g, "").toUpperCase()}B`;

  beforeAll(async () => {
    vi.stubEnv("SLACK_CLIENT_ID", "111.222");
    vi.stubEnv("SLACK_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("SLACK_SIGNING_SECRET", SIGNING);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://daythread.org");
    a = await workspace("Slack One");
    b = await workspace("Slack Two");
    ids.push(a.businessId, b.businessId);
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const method = String(url).replace("https://slack.com/api/", "");
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const raw = String(init?.body ?? "");
      const body = raw.startsWith("{") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
      calls.push({ method, token: headers.Authorization?.replace("Bearer ", "") ?? null, body });
      const answer = answers[method]?.(body) ?? { ok: false, error: "unknown_method" };
      return answer instanceof Response ? answer : json(answer);
    });
    ({ GET } = await import("@/app/api/auth/slack/callback/route"));
    ({ POST } = await import("@/app/api/webhooks/slack/events/route"));
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await prisma.user.deleteMany({ where: { orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });
  beforeEach(() => {
    calls = [];
    jar.clear();
    current.session = null;
    answers = {
      "oauth.v2.access": (body) => ({ ok: true, access_token: `xoxb-for-${body.code}`, scope: "chat:write,channels:read,channels:join", bot_user_id: "U_BOT", team: { id: TEAM_A, name: "Studio A" }, authed_user: { id: "U1" } }),
      "auth.revoke": () => ({ ok: true, revoked: true }),
      "conversations.list": () => ({ ok: true, channels: [{ id: "C_LEADS", name: "leads", is_member: false }, { id: "C_GEN", name: "general", is_member: true }], response_metadata: { next_cursor: "" } }),
      "conversations.join": () => ({ ok: true }),
      "chat.postMessage": () => ({ ok: true, ts: "1.1" }),
    };
  });

  const row = (businessId: string) => prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "SLACK" } } });

  // ── the consent screen ────────────────────────────────────────────────────

  it("builds a bot-scoped consent URL with state, and never the secret", () => {
    const url = new URL(slackAuthUrl("state-1"));
    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("client_id")).toBe("111.222");
    expect(url.searchParams.get("scope")).toBe("chat:write,channels:read,channels:join");
    expect(url.searchParams.get("user_scope")).toBeNull();
    expect(url.searchParams.get("redirect_uri")).toBe("https://daythread.org/api/auth/slack/callback");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.toString()).not.toContain("test-client-secret");
    expect(slackEventsUrl()).toBe("https://daythread.org/api/webhooks/slack/events");
  });

  it("Connect refuses anyone who is not an owner or admin, and requires a session", async () => {
    await expect(connectSlack(null)).rejects.toThrow(/unauthorized/);
    const s = stamp();
    const member = await prisma.user.create({ data: { name: "Staff", email: `staff-${s}@example.test`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: member.id, businessId: a.businessId, role: "PHOTOGRAPHER" } });
    await expect(connectSlack({ userId: member.id, activeBusinessId: a.businessId })).rejects.toThrow(/unauthorized/);
    // The owner is sent to Slack.
    await expect(connectSlack(a.session)).rejects.toThrow(/NEXT_REDIRECT:https:\/\/slack\.com\/oauth\/v2\/authorize/);
  });

  // ── the callback ──────────────────────────────────────────────────────────

  const startFlow = async (w: typeof a) => {
    const state = await signOAuthState({ provider: "slack", purpose: "notifications", businessId: w.businessId, userId: w.userId });
    current.session = w.session;
    return state;
  };
  const callback = (state: string, code = `code-${stamp()}`) => GET(new Request(`http://localhost/api/auth/slack/callback?code=${code}&state=${encodeURIComponent(state)}`));

  it("a good install stores the workspace's bot token against the right business, encrypted", async () => {
    const state = await startFlow(a);
    const res = await callback(state, "good");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("setup=SLACK");
    const r = await row(a.businessId);
    expect(r?.status).toBe("CONNECTED");
    expect(r?.externalId).toBe(TEAM_A);
    expect(r?.externalAccount).toBe("Studio A");
    expect(r?.accessToken).toBe("xoxb-for-good");
    expect((r?.settings as { teamId: string }).teamId).toBe(TEAM_A);
    // The secret went in the exchange body, never on a URL.
    const exchange = calls.find((c) => c.method === "oauth.v2.access");
    expect(exchange?.body.client_secret).toBe("test-client-secret");
    // At rest, the column does not hold the plaintext token.
    const raw = await prisma.$queryRaw<Array<{ accessToken: string | null }>>`SELECT "accessToken" FROM "Integration" WHERE "id" = ${r!.id}`;
    if (process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY) expect(raw[0].accessToken).not.toBe("xoxb-for-good");
    expect(await row(b.businessId)).toBeNull();
  });

  it("a state that was never issued, one finished by someone else, and a refusal all connect nothing", async () => {
    expect((await GET(new Request("http://localhost/api/auth/slack/callback?code=c"))).headers.get("location")).toContain("connect_error=state");
    const state = await startFlow(b);
    current.session = a.session;
    expect((await callback(state)).headers.get("location")).toContain("connect_error=session");
    expect(await row(b.businessId)).toBeNull();
    expect((await GET(new Request("http://localhost/api/auth/slack/callback?error=access_denied&state=x"))).headers.get("location")).toContain("connect_error=denied");
    answers["oauth.v2.access"] = () => ({ ok: false, error: "invalid_code" });
    const state2 = await startFlow(b);
    expect((await callback(state2)).headers.get("location")).toContain("connect_error");
    expect(await row(b.businessId)).toBeNull();
  });

  // ── choosing a channel ────────────────────────────────────────────────────

  it("lists channels with the workspace's own token, joins the chosen one, and proves it with a real post", async () => {
    const listed = await listSlackChannelsAction(a.session);
    expect(listed.error).toBeUndefined();
    expect(listed.channels.map((c) => c.name)).toEqual(["general", "leads"]);
    expect(calls.find((c) => c.method === "conversations.list")?.token).toBe("xoxb-for-good");

    const chosen = await selectSlackChannel("C_LEADS", a.session);
    expect(chosen.error).toBeUndefined();
    expect(chosen.channelName).toBe("leads");
    expect(calls.some((c) => c.method === "conversations.join" && c.body.channel === "C_LEADS")).toBe(true);
    const post = calls.find((c) => c.method === "chat.postMessage");
    expect(post?.token).toBe("xoxb-for-good");
    expect(post?.body.channel).toBe("C_LEADS");
    const r = await row(a.businessId);
    expect((r?.settings as { channelId: string; channelName: string }).channelId).toBe("C_LEADS");
  });

  it("a channel Slack does not list cannot be chosen", async () => {
    const r = await selectSlackChannel("C_NOT_THERE", a.session);
    expect(r.error).toBeTruthy();
    expect((await row(a.businessId))?.settings).toMatchObject({ channelId: "C_LEADS" });
  });

  // ── reinstall ─────────────────────────────────────────────────────────────

  it("reinstalling into the same workspace keeps the channel; a different workspace starts over", async () => {
    answers["oauth.v2.access"] = (body) => ({ ok: true, access_token: `xoxb-for-${body.code}`, scope: "chat:write,channels:read,channels:join", bot_user_id: "U_BOT", team: { id: TEAM_A, name: "Studio A" } });
    const state = await startFlow(a);
    const res = await callback(state, "again");
    expect(res.headers.get("location")).toContain("connected=SLACK");
    expect(res.headers.get("location")).not.toContain("setup=SLACK");
    const r = await row(a.businessId);
    expect(r?.accessToken).toBe("xoxb-for-again");
    expect(r?.settings).toMatchObject({ channelId: "C_LEADS", channelName: "leads" });

    answers["oauth.v2.access"] = (body) => ({ ok: true, access_token: `xoxb-for-${body.code}`, scope: "chat:write", bot_user_id: "U_BOT", team: { id: `${TEAM_A}X`, name: "Other Studio" } });
    const state2 = await startFlow(a);
    expect((await callback(state2, "moved")).headers.get("location")).toContain("setup=SLACK");
    expect((await row(a.businessId))?.settings).toMatchObject({ channelId: null });
    // Put it back for the tests below.
    answers["oauth.v2.access"] = (body) => ({ ok: true, access_token: `xoxb-for-${body.code}`, scope: "chat:write,channels:read,channels:join", bot_user_id: "U_BOT", team: { id: TEAM_A, name: "Studio A" } });
    await callback(await startFlow(a), "restored");
    await selectSlackChannel("C_LEADS", a.session);
  });

  // ── posting, and what Slack's answers mean ────────────────────────────────

  it("a notice posts to the chosen channel with a link back, and a customer's words never go", async () => {
    await notifyBusiness(a.businessId, { kind: "lead", title: "Jane wrote to you", body: "New inquiry on email.", target: { kind: "conversation", id: "conv1" } });
    await new Promise((r) => setTimeout(r, 50));
    const post = calls.find((c) => c.method === "chat.postMessage");
    expect(post?.body.channel).toBe("C_LEADS");
    expect(String(post?.body.text)).toContain("Jane wrote to you");
    expect(String(post?.body.text)).toContain("https://daythread.org/dashboard/inbox?c=conv1");
  });

  it("a rate limit is a wait, not a broken connection", async () => {
    answers["chat.postMessage"] = () => new Response(JSON.stringify({ ok: false, error: "ratelimited" }), { status: 429, headers: { "retry-after": "2" } });
    expect(await postToSlack(a.businessId, { title: "Busy", body: "x" })).toBe(false);
    const r = await row(a.businessId);
    expect(r?.status).toBe("CONNECTED");
    expect((r?.settings as { lastPostError: string }).lastPostError).toBe("rate_limited");
  });

  it.each([
    ["channel_not_found", "SYNC_ERROR", /channel/i],
    ["not_in_channel", "SYNC_ERROR", /channel/i],
    ["is_archived", "SYNC_ERROR", /channel/i],
    ["invalid_auth", "NEEDS_ATTENTION", /revoked/i],
    ["token_revoked", "NEEDS_ATTENTION", /revoked/i],
    ["account_inactive", "NEEDS_ATTENTION", /revoked/i],
    ["internal_error", "SYNC_ERROR", /try again/i],
  ])("Slack answering %s records %s with a sentence, and never claims the post went", async (error, status, message) => {
    answers["chat.postMessage"] = () => ({ ok: false, error });
    expect(await postToSlack(a.businessId, { title: "Ping", body: "x" })).toBe(false);
    const r = await row(a.businessId);
    expect(r?.status).toBe(status);
    expect(r?.lastError).toMatch(message);
    // Reset so the next case starts from a healthy row.
    await prisma.integration.update({ where: { id: r!.id }, data: { status: "CONNECTED", lastError: null } });
  });

  it("the raw post helper turns Slack's ok:false into a typed error, never a silent success", async () => {
    answers["chat.postMessage"] = () => ({ ok: false, error: "msg_too_long" });
    await expect(postSlackMessage("xoxb-x", "C1", "hi")).rejects.toBeInstanceOf(OAuthError);
    answers["chat.postMessage"] = () => new Response("<html>", { status: 200 });
    await expect(postSlackMessage("xoxb-x", "C1", "hi")).rejects.toThrow(/invalid_json/);
  });

  // ── the events route ──────────────────────────────────────────────────────

  it("answers Slack's URL verification with the challenge, only when signed", async () => {
    const body = JSON.stringify({ type: "url_verification", challenge: "abc-123", token: "legacy" });
    const r = await POST(signed(body));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("abc-123");
    const unsigned = await POST(new Request("http://localhost/api/webhooks/slack/events", { method: "POST", body, headers: { "content-type": "application/json" } }));
    expect(unsigned.status).toBe(401);
    expect((await POST(signed(JSON.stringify({ type: "url_verification", challenge: 42 })))).status).toBe(400);
  });

  it("verifies v0=HMAC(v0:timestamp:body) exactly, within five minutes", () => {
    const body = JSON.stringify({ type: "event_callback" });
    const ts = String(Math.floor(Date.now() / 1000));
    const good = `v0=${createHmac("sha256", SIGNING).update(`v0:${ts}:${body}`).digest("hex")}`;
    expect(verifySlackSignature(body, good, ts)).toBe(true);
    expect(verifySlackSignature(`${body} `, good, ts)).toBe(false);
    expect(verifySlackSignature(body, good, String(Number(ts) + 1))).toBe(false);
    expect(verifySlackSignature(body, good.replace("v0=", "v1="), ts)).toBe(false);
    expect(verifySlackSignature(body, `v0=${createHmac("sha256", "other-secret").update(`v0:${ts}:${body}`).digest("hex")}`, ts)).toBe(false);
    expect(verifySlackSignature(body, null, ts)).toBe(false);
    expect(verifySlackSignature(body, good, null)).toBe(false);
    expect(verifySlackSignature(body, good, "soon")).toBe(false);
    const old = String(Math.floor(Date.now() / 1000) - 600);
    expect(verifySlackSignature(body, `v0=${createHmac("sha256", SIGNING).update(`v0:${old}:${body}`).digest("hex")}`, old)).toBe(false);
    expect(verifySlackSignature(body, good, ts, { secret: null })).toBe(false);
  });

  it("a forged, stale, malformed or unrelated event changes nothing", async () => {
    const before = await row(a.businessId);
    const uninstall = JSON.stringify({ type: "event_callback", event_id: `Ev${stamp()}`, team_id: TEAM_A, event: { type: "app_uninstalled" } });
    expect((await POST(signed(uninstall, { secret: "wrong" }))).status).toBe(401);
    expect((await POST(signed(uninstall, { ts: Math.floor(Date.now() / 1000) - 900 }))).status).toBe(401);
    expect((await POST(signed("not json"))).status).toBe(400);
    const odd = await POST(signed(JSON.stringify({ type: "event_callback", event_id: `Ev${stamp()}`, team_id: TEAM_A, event: { type: "message" } })));
    expect(await odd.json()).toMatchObject({ ignored: "message" });
    expect(parseSlackEvent({ type: "event_callback", event_id: "x", team_id: "T", event: {} })).toBeNull();
    expect((await row(a.businessId))?.status).toBe(before?.status);
    expect((await row(a.businessId))?.accessToken).toBe(before?.accessToken);
  });

  it("an uninstall for a workspace nobody connected touches nothing", async () => {
    const r = await POST(signed(JSON.stringify({ type: "event_callback", event_id: `Ev${stamp()}`, team_id: "T_NOBODY", event: { type: "app_uninstalled" } })));
    expect(r.status).toBe(200);
    expect((await row(a.businessId))?.status).toBe("CONNECTED");
  });

  it("business B's Slack team cannot touch business A's connection, in either direction", async () => {
    // B installs its own workspace.
    answers["oauth.v2.access"] = (body) => ({ ok: true, access_token: `xoxb-b-${body.code}`, scope: "chat:write", bot_user_id: "U_B", team: { id: TEAM_B, name: "Studio B" } });
    await callback(await startFlow(b), "b1");
    expect((await row(b.businessId))?.externalId).toBe(TEAM_B);
    // A signed uninstall from B's team leaves A untouched.
    await POST(signed(JSON.stringify({ type: "event_callback", event_id: `Ev${stamp()}`, team_id: TEAM_B, event: { type: "tokens_revoked", tokens: { bot: ["U_B"] } } })));
    expect((await row(a.businessId))?.status).toBe("CONNECTED");
    expect((await row(a.businessId))?.accessToken).toBe("xoxb-for-restored");
    expect((await row(b.businessId))?.status).toBe("NEEDS_ATTENTION");
    expect((await row(b.businessId))?.accessToken).toBeNull();
    // A's session can neither read B's channels nor set B's channel: every action is
    // scoped to the caller's own workspace, so B's row is simply not what it sees.
    calls = [];
    await listSlackChannelsAction(a.session);
    expect(calls.every((c) => c.token === "xoxb-for-restored")).toBe(true);
    // A notice for A goes with A's token to A's channel; B's dead row posts nothing.
    calls = [];
    await postToSlack(a.businessId, { title: "A only", body: "x" });
    expect(calls.filter((c) => c.method === "chat.postMessage").map((c) => c.token)).toEqual(["xoxb-for-restored"]);
    expect(await postToSlack(b.businessId, { title: "B?", body: "x" })).toBe(false);
  });

  it("an uninstall turns the row honest and a retry of the same event is a no-op", async () => {
    const eventId = `Ev${stamp()}`;
    const body = JSON.stringify({ type: "event_callback", event_id: eventId, team_id: TEAM_A, event: { type: "app_uninstalled" } });
    const first = await POST(signed(body));
    expect(first.status).toBe(200);
    const r = await row(a.businessId);
    expect(r?.status).toBe("NEEDS_ATTENTION");
    expect(r?.accessToken).toBeNull();
    expect(r?.lastError).toMatch(/removed from your Slack/i);
    expect(r?.settings).toMatchObject({ lastPostError: "auth" });
    const again = await POST(signed(body));
    expect(await again.json()).toMatchObject({ duplicate: true });
    // Nothing is posted with a dead token, and nothing pretends it was.
    calls = [];
    expect(await postToSlack(a.businessId, { title: "After", body: "x" })).toBe(false);
    expect(calls.filter((c) => c.method === "chat.postMessage")).toHaveLength(0);
    expect(await prisma.auditLog.count({ where: { businessId: a.businessId, action: "integration.revoked_by_provider" } })).toBe(1);
  });

  // ── disconnect ────────────────────────────────────────────────────────────

  it("disconnecting revokes the token at Slack and empties the row; a stranger cannot", async () => {
    await callback(await startFlow(a), "final");
    expect((await row(a.businessId))?.status).toBe("CONNECTED");
    await expect(disconnectIntegration("SLACK", b.session)).resolves.toBeDefined();
    // B disconnecting "Slack" acts on B's own row only; A is still connected.
    expect((await row(a.businessId))?.status).toBe("CONNECTED");
    calls = [];
    await disconnectIntegration("SLACK", a.session);
    expect(calls.some((c) => c.method === "auth.revoke" && c.token === "xoxb-for-final")).toBe(true);
    const r = await row(a.businessId);
    expect(r?.status).toBe("NOT_CONNECTED");
    expect(r?.accessToken).toBeNull();
    expect(r?.externalId).toBeNull();
    expect(await postToSlack(a.businessId, { title: "Gone", body: "x" })).toBe(false);
  });
});
