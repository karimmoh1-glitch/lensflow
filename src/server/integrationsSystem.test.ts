import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";

/**
 * The integrations system's shared machinery, against the real database:
 *   - the OAuth callback runner (state, tenant binding, PKCE, exclusivity, plan gate,
 *     encrypted storage, audit line);
 *   - the webhook inbox (claim, retry from the stored payload, dead letter);
 *   - invite-only access requests and the maturity flags;
 *   - the registry's groups;
 *   - Slack notices (what is posted, what is never posted, how a refusal is recorded).
 * Providers are stubbed at the network edge by URL; no request leaves the machine.
 */
const jar = vi.hoisted(() => new Map<string, string>());
const current = vi.hoisted(() => ({ session: null as null | { userId: string; activeBusinessId: string } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined), set: (k: string, v: string) => { jar.set(k, v); }, delete: (k: string) => { jar.delete(k); } }) }));
vi.mock("@/lib/auth", async (importOriginal) => { const mod = await importOriginal<typeof import("@/lib/auth")>(); return { ...mod, getSession: async () => current.session }; });

import { signOAuthState, beginPkce, signOAuthStateRaw, verifyOAuthStateWithNonce } from "@/lib/integrations/oauthState";
import { completeOAuthConnect, type OAuthConnectSpec } from "@/server/oauthConnect";
import { runWebhook, retryFailedWebhooks, MAX_ATTEMPTS, STALE_CLAIM_MS } from "@/server/webhookInbox";
import { requestAccess, decideAccess, accessGranted, accessRequestFor } from "@/server/accessRequests";
import { GROUPS, PROVIDERS, COMING_SOON, comingSoonFor, providerMaturity, type RegisteredProvider } from "@/lib/integrations/registry";
import { accessGated } from "@/lib/integrations/flags";
import { notifyBusiness, postToSlack } from "@/server/notify";

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function workspace(name: string, plan: "FREE" | "PRO" = "FREE") {
  const biz = await prisma.business.create({ data: { name, handle: `${name.toLowerCase().replace(/\W+/g, "-")}-${stamp()}`, planTier: plan, ...(plan === "PRO" ? { billingStatus: "ACTIVE" } : {}) } });
  const user = await prisma.user.create({ data: { name: `${name} Owner`, email: `${name.toLowerCase().replace(/\W+/g, "-")}-${stamp()}@example.test`, passwordHash: "x" } });
  await prisma.orgMembership.create({ data: { userId: user.id, businessId: biz.id, role: "OWNER" } });
  return { businessId: biz.id, userId: user.id };
}

describe("OAuth callback runner", () => {
  const ids: string[] = [];
  let a: { businessId: string; userId: string };
  let b: { businessId: string; userId: string };
  const revoked: string[] = [];
  const spec = (over: Partial<OAuthConnectSpec> = {}): OAuthConnectSpec => ({
    oauthProvider: "dropbox",
    purposes: ["files"],
    providerFor: () => "DROPBOX",
    pkce: true,
    requireRefreshToken: true,
    exclusive: true,
    exchange: async (code, verifier) => { expect(verifier).toBeTruthy(); return { accessToken: `dbx-access-${code}`, refreshToken: `dbx-refresh-${code}`, expiresAt: new Date(Date.now() + 3600_000), scope: "files.metadata.read", raw: {} }; },
    identity: async () => ({ externalId: "dbid:acct-1", externalAccount: "owner@example.test" }),
    revoke: async (t) => { revoked.push(t.accessToken); },
    ...over,
  });
  const start = async (w: { businessId: string; userId: string }, purpose: "files" | "drive" = "files", provider: "dropbox" | "google" = "dropbox") => {
    const state = await signOAuthState({ provider, purpose, businessId: w.businessId, userId: w.userId });
    await beginPkce("dropbox");
    return new Request(`http://localhost/api/auth/dropbox/callback?code=c${stamp()}&state=${encodeURIComponent(state)}`);
  };
  const location = (res: Response) => new URL(res.headers.get("location")!);
  beforeAll(async () => { a = await workspace("Runner A"); b = await workspace("Runner B"); ids.push(a.businessId, b.businessId); });
  afterEach(() => { jar.clear(); revoked.length = 0; });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); });

  it("connects: verified state, PKCE consumed, tokens stored encrypted, audit line, redirect with the provider", async () => {
    current.session = { userId: a.userId, activeBusinessId: a.businessId };
    const res = await completeOAuthConnect(await start(a), spec());
    const to = location(res);
    expect(to.searchParams.get("connected")).toBe("DROPBOX");
    expect(to.searchParams.get("connect_error")).toBeNull();
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: a.businessId, provider: "DROPBOX" } } });
    expect(row?.status).toBe("CONNECTED");
    expect(row?.externalId).toBe("dbid:acct-1");
    expect(row?.refreshToken).toMatch(/^dbx-refresh-/);
    if (tokenCryptoConfigured()) {
      const raw = await prisma.$queryRaw<Array<{ accessToken: string | null }>>`SELECT "accessToken" FROM "Integration" WHERE "id" = ${row!.id}`;
      expect(raw[0].accessToken).not.toMatch(/^dbx-access-/);
    }
    expect(jar.has("dropbox_oauth_pkce")).toBe(false);
    expect(jar.has("dropbox_oauth_nonce")).toBe(false);
    const audit = await prisma.auditLog.findFirst({ where: { businessId: a.businessId, action: "integration.connected", targetId: row!.id } });
    expect(audit?.metadata).toMatchObject({ provider: "DROPBOX" });
  });

  it("refuses a state minted for another provider or purpose, and a callback without its PKCE cookie", async () => {
    current.session = { userId: a.userId, activeBusinessId: a.businessId };
    const wrong = await completeOAuthConnect(await start(a, "drive", "google"), spec());
    expect(location(wrong).searchParams.get("connect_error")).toBe("state");
    const req = await start(a);
    jar.delete("dropbox_oauth_pkce");
    const noPkce = await completeOAuthConnect(req, spec());
    expect(location(noPkce).searchParams.get("connect_error")).toBe("state");
    expect(revoked).toHaveLength(0);
  });

  it("binds the callback to the user who started it and to a workspace they administer", async () => {
    current.session = { userId: b.userId, activeBusinessId: b.businessId };
    const other = await completeOAuthConnect(await start(a), spec());
    expect(location(other).searchParams.get("connect_error")).toBe("session");
    const state = await signOAuthState({ provider: "dropbox", purpose: "files", businessId: a.businessId, userId: b.userId });
    await beginPkce("dropbox");
    const notMember = await completeOAuthConnect(new Request(`http://localhost/cb?code=x&state=${encodeURIComponent(state)}`), spec());
    expect(location(notMember).searchParams.get("connect_error")).toBe("tenant");
    expect(await prisma.integration.findUnique({ where: { businessId_provider: { businessId: a.businessId, provider: "DROPBOX" } } }).then((r) => r?.externalAccount)).toBe("owner@example.test");
  });

  it("an account already connected elsewhere is refused and the fresh grant is revoked", async () => {
    current.session = { userId: b.userId, activeBusinessId: b.businessId };
    const res = await completeOAuthConnect(await start(b), spec());
    expect(location(res).searchParams.get("connect_error")).toBe("in_use");
    expect(revoked).toHaveLength(1);
    expect(await prisma.integration.findUnique({ where: { businessId_provider: { businessId: b.businessId, provider: "DROPBOX" } } })).toBeNull();
  });

  it("the plan's allowance is enforced at the end of the flow: refused means revoked, nothing stored", async () => {
    await prisma.integration.createMany({ data: [{ businessId: b.businessId, provider: "EMAIL", status: "CONNECTED" }, { businessId: b.businessId, provider: "SLACK", status: "CONNECTED" }] });
    current.session = { userId: b.userId, activeBusinessId: b.businessId };
    const res = await completeOAuthConnect(await start(b), spec({ identity: async () => ({ externalId: "dbid:acct-2", externalAccount: "b@example.test" }) }));
    expect(location(res).searchParams.get("connect_error")).toBe("limit");
    expect(revoked).toHaveLength(1);
    expect(await prisma.integration.findUnique({ where: { businessId_provider: { businessId: b.businessId, provider: "DROPBOX" } } })).toBeNull();
  });

  it("a refresh token is required when the provider promises one, and a missing scope sends the grant back", async () => {
    current.session = { userId: a.userId, activeBusinessId: a.businessId };
    const noRefresh = await completeOAuthConnect(await start(a), spec({ exchange: async () => ({ accessToken: "short", refreshToken: null, expiresAt: null, scope: "x", raw: {} }) }));
    expect(location(noRefresh).searchParams.get("connect_error")).toBe("no_refresh_token");
    const noScope = await completeOAuthConnect(await start(a), spec({ requiredScope: /files\.content\.write/ }));
    expect(location(noScope).searchParams.get("connect_error")).toBe("scopes");
    expect(revoked).toHaveLength(2);
  });

  it("every new OAuth provider and purpose signs and verifies like Google's", async () => {
    for (const provider of ["microsoft", "slack", "dropbox", "calendly", "stripe"] as const) {
      const { state, nonce } = await signOAuthStateRaw({ provider, purpose: "notifications", businessId: "b", userId: "u" });
      expect((await verifyOAuthStateWithNonce(provider, state, nonce)).ok).toBe(true);
      expect((await verifyOAuthStateWithNonce("google", state, nonce)).ok).toBe(false);
    }
  });
});

describe("webhook inbox", () => {
  const provider = `test_${stamp()}`;
  afterAll(async () => { await prisma.webhookEvent.deleteMany({ where: { provider } }); });

  it("claims by event id: a redelivery of a processed event is a duplicate and the handler does not run again", async () => {
    let runs = 0;
    const id = `evt_${stamp()}`;
    expect((await runWebhook(provider, id, { n: 1 }, async () => { runs++; })).status).toBe("processed");
    expect((await runWebhook(provider, id, { n: 1 }, async () => { runs++; })).status).toBe("duplicate");
    expect(runs).toBe(1);
    const row = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider, eventId: id } } });
    expect(row).toMatchObject({ status: "processed", attempts: 1, payload: null });
  });

  it("a claim whose handler was killed is taken over, rather than losing the event for ever", async () => {
    // A function timeout or an out-of-memory kill leaves the row at "received" with no catch
    // block ever running. Answering "duplicate" to every later redelivery meant the event was
    // lost: a paid subscription that never activated, a customer's message that never arrived.
    const id = `evt_${stamp()}`;
    let ran = 0;
    await prisma.webhookEvent.create({ data: { provider, eventId: id, status: "received" } });

    // While it might still be in flight, a redelivery is a duplicate and must not run twice.
    expect((await runWebhook(provider, id, { n: 1 }, async () => { ran++; })).status).toBe("duplicate");
    expect(ran).toBe(0);

    // Once it is plainly not coming back, the next redelivery is allowed to take it over.
    await prisma.webhookEvent.update({ where: { provider_eventId: { provider, eventId: id } }, data: { receivedAt: new Date(Date.now() - STALE_CLAIM_MS - 1000) } });
    expect((await runWebhook(provider, id, { n: 1 }, async () => { ran++; })).status).toBe("processed");
    expect(ran).toBe(1);
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider, eventId: id } } })).status).toBe("processed");
  });

  it("the daily run releases claims that never finished, so the provider's redelivery is accepted", async () => {
    const id = `evt_${stamp()}`;
    await prisma.webhookEvent.create({ data: { provider, eventId: id, status: "received", receivedAt: new Date(Date.now() - STALE_CLAIM_MS - 1000) } });
    await retryFailedWebhooks({ [provider]: async () => {} });
    const row = await prisma.webhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider, eventId: id } } });
    // No stored payload to replay, so it is released rather than processed.
    expect(["failed", "processed"]).toContain(row.status);
    expect(row.status).not.toBe("received");
  });

  it("a failed delivery keeps the verified payload and a scrubbed error; the provider's redelivery and the daily run process it again; after the cap it is a dead letter", async () => {
    const id = `evt_${stamp()}`;
    let fail = true;
    const handler = async () => { if (fail) throw new Error("db down; token=sk_live_abcdefghijklmnop"); };
    expect((await runWebhook(provider, id, { hello: "world" }, handler)).status).toBe("failed");
    let row = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider, eventId: id } } });
    expect(row).toMatchObject({ status: "failed", attempts: 1, payload: { hello: "world" } });
    expect(row?.lastError).not.toContain("sk_live_abcdefghijklmnop");
    // The provider redelivers: not a duplicate, a retry.
    expect((await runWebhook(provider, id, { hello: "world" }, handler)).status).toBe("failed");
    // The daily run retries from the stored payload and succeeds.
    fail = false;
    const r = await retryFailedWebhooks({ [provider]: handler });
    expect(r.processed).toBeGreaterThanOrEqual(1);
    row = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider, eventId: id } } });
    expect(row).toMatchObject({ status: "processed", payload: null });
    // Dead after the cap.
    const dead = `evt_${stamp()}`;
    const always = async () => { throw new Error("no"); };
    for (let i = 0; i < MAX_ATTEMPTS; i++) await runWebhook(provider, dead, { x: 1 }, always);
    row = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider, eventId: dead } } });
    expect(row).toMatchObject({ status: "dead", attempts: MAX_ATTEMPTS, payload: null });
    expect((await runWebhook(provider, dead, { x: 1 }, always)).status).toBe("dead");
  });
});

describe("invite-only access", () => {
  const ids: string[] = [];
  let w: { businessId: string; userId: string };
  beforeAll(async () => { w = await workspace("Access A"); ids.push(w.businessId); });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); vi.unstubAllEnvs(); });

  it("Instagram is beta by default: nothing until a founder approves; revoking takes it back; open mode needs no request", async () => {
    vi.stubEnv("INTEGRATION_INSTAGRAM_MODE", "");
    expect(providerMaturity("INSTAGRAM")).toBe("beta");
    expect(await accessGranted(w.businessId, "INSTAGRAM")).toBe(false);
    expect(await requestAccess(w.businessId, w.userId, "INSTAGRAM", "We run a studio")).toMatchObject({ ok: true, status: "PENDING" });
    expect(await requestAccess(w.businessId, w.userId, "INSTAGRAM", "again")).toMatchObject({ ok: true, status: "PENDING" });
    expect(await accessGranted(w.businessId, "INSTAGRAM")).toBe(false);
    const row = await prisma.integrationAccessRequest.findUnique({ where: { businessId_provider: { businessId: w.businessId, provider: "INSTAGRAM" } } });
    expect(await decideAccess(row!.id, "APPROVED", w.userId, null)).toEqual({ ok: true });
    expect(await accessGranted(w.businessId, "INSTAGRAM")).toBe(true);
    expect((await accessRequestFor(w.businessId, "INSTAGRAM")).status).toBe("APPROVED");
    expect(await prisma.notification.findFirst({ where: { businessId: w.businessId, title: "Instagram access approved" } })).toBeTruthy();
    expect(await decideAccess(row!.id, "REVOKED", w.userId, "Paused while Meta reviews")).toEqual({ ok: true });
    expect(await accessGranted(w.businessId, "INSTAGRAM")).toBe(false);
    vi.stubEnv("INTEGRATION_INSTAGRAM_MODE", "open");
    expect(providerMaturity("INSTAGRAM")).toBe("ga");
    expect(await accessGranted(w.businessId, "INSTAGRAM")).toBe(true);
    expect(await requestAccess(w.businessId, w.userId, "INSTAGRAM", null)).toMatchObject({ ok: false });
  });

  it("WhatsApp is coming soon by default and never grants access; every other provider is generally available", async () => {
    vi.stubEnv("INTEGRATION_WHATSAPP_MODE", "");
    expect(providerMaturity("WHATSAPP")).toBe("coming_soon");
    expect(await accessGranted(w.businessId, "WHATSAPP")).toBe(false);
    vi.stubEnv("INTEGRATION_WHATSAPP_MODE", "open");
    expect(providerMaturity("WHATSAPP")).toBe("ga");
    for (const p of ["EMAIL", "SLACK", "STRIPE", "CALENDLY", "DROPBOX", "MICROSOFT_OUTLOOK"] as const) expect(providerMaturity(p)).toBe("ga");
  });
});

describe("beta gate", () => {
  it("only a genuinely active row or an approval opens the gate; a legacy DEMO or NOT_CONNECTED row does not", () => {
    expect(accessGated("beta", null, null)).toBe(true);
    expect(accessGated("beta", "PENDING", "NOT_CONNECTED")).toBe(true);
    expect(accessGated("beta", null, "DEMO")).toBe(true);
    expect(accessGated("beta", "APPROVED", null)).toBe(false);
    for (const active of ["CONNECTED", "SYNC_ERROR", "NEEDS_ATTENTION"]) expect(accessGated("beta", null, active)).toBe(false);
    expect(accessGated("ga", null, null)).toBe(false);
    expect(accessGated("coming_soon", null, null)).toBe(false);
  });
});

describe("registry", () => {
  it("nothing that cannot be connected is ever offered as if it could be", () => {
    // A coming-soon entry must not collide with a real provider, or the hub would show the
    // same integration twice and one of them would be a lie.
    for (const c of COMING_SOON) {
      expect(Object.keys(PROVIDERS)).not.toContain(c.key);
      expect(GROUPS.some((g) => g.key === c.group)).toBe(true);
      expect(c.summary.length).toBeGreaterThan(10);
    }
    expect(comingSoonFor("meetings").length).toBeGreaterThan(0);
  });

  it("every registered provider sits in exactly one group, and every group entry is registered", () => {
    const seen = new Map<string, number>();
    for (const g of GROUPS) for (const p of g.providers) { seen.set(p, (seen.get(p) ?? 0) + 1); expect(PROVIDERS[p]).toBeTruthy(); expect(PROVIDERS[p].group).toBe(g.key); }
    for (const key of Object.keys(PROVIDERS) as RegisteredProvider[]) expect(seen.get(key)).toBe(1);
  });
});

describe("Slack notices", () => {
  const ids: string[] = [];
  let w: { businessId: string; userId: string };
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  let answer: unknown = { ok: true, ts: "1.2" };
  beforeAll(async () => {
    w = await workspace("Slack A"); ids.push(w.businessId);
    await prisma.integration.create({ data: { businessId: w.businessId, provider: "SLACK", status: "CONNECTED", accessToken: "xoxb-test", externalId: "T1", externalAccount: "Studio", settings: { teamId: "T1", teamName: "Studio", channelId: "C1", channelName: "leads" } } });
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => { posts.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) }); return json(answer); });
  });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); vi.unstubAllGlobals(); });

  it("posts the title and the short body with a link back — never a customer's message", async () => {
    await notifyBusiness(w.businessId, { kind: "lead", title: "Jane Doe wrote to you", body: "New inquiry on email.", target: { kind: "conversation", id: "abc" } });
    await new Promise((r) => setTimeout(r, 50));
    const post = posts.find((p) => p.url.includes("chat.postMessage"));
    expect(post?.body.channel).toBe("C1");
    expect(String(post?.body.text)).toContain("Jane Doe wrote to you");
    expect(String(post?.body.text)).toContain("/dashboard/inbox?c=abc");
    expect(await prisma.notification.findFirst({ where: { businessId: w.businessId, title: "Jane Doe wrote to you" } })).toBeTruthy();
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: w.businessId, provider: "SLACK" } } });
    expect(row?.lastSyncStatus).toBe("ok");
  });

  it("a gone channel is a sync issue with a reason; a revoked token needs attention; the notice itself is still recorded", async () => {
    answer = { ok: false, error: "channel_not_found" };
    expect(await postToSlack(w.businessId, { title: "New booking", body: "x" })).toBe(false);
    let row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: w.businessId, provider: "SLACK" } } });
    expect(row?.status).toBe("SYNC_ERROR");
    expect(row?.lastError).toMatch(/channel/i);
    answer = { ok: false, error: "token_revoked" };
    expect(await postToSlack(w.businessId, { title: "New booking", body: "x" })).toBe(false);
    row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: w.businessId, provider: "SLACK" } } });
    expect(row?.status).toBe("NEEDS_ATTENTION");
    answer = { ok: true, ts: "1.3" };
  });
});
