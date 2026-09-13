import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createHmac } from "crypto";
import { addHours } from "date-fns";
import { prisma } from "@/lib/db";

const jar = vi.hoisted(() => new Map<string, string>());
const current = vi.hoisted(() => ({ session: null as null | { userId: string; activeBusinessId: string } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 20}` }),
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined), set: (k: string, v: string) => { jar.set(k, v); }, delete: (k: string) => { jar.delete(k); } }),
}));
vi.mock("@/lib/auth", async (importOriginal) => { const mod = await importOriginal<typeof import("@/lib/auth")>(); return { ...mod, getSession: async () => current.session }; });
// Calendar pushes are not what is under test; they would otherwise try Google.
vi.mock("@/server/calendarSync", async (importOriginal) => { const mod = await importOriginal<typeof import("@/server/calendarSync")>(); return { ...mod, pushBookingToCalendars: async () => {} }; });

import { signOAuthState, signOAuthStateRaw } from "@/lib/integrations/oauthState";
import { zoomAuthUrl, verifyZoomSignature, zoomUrlValidationResponse, meetingBody, zoomToken, createZoomMeeting as createAtZoom, userFacingZoomError, ZOOM_SCOPES } from "@/lib/zoom";
import { connectZoom, disconnectIntegration } from "@/app/actions/connect";
import { createZoomMeeting, startZoomMeeting, removeZoomMeeting } from "@/app/actions/meetings";
import { cancelBooking } from "@/app/actions/bookings";
import { moveMeetingForBooking } from "@/server/zoomMeetings";
import { OAuthError } from "@/lib/integrations/oauth";

/**
 * Zoom, end to end against the real database, with Zoom stubbed at the network edge and
 * every request captured. What this proves is Daythread's side of the contract: the
 * consent URL, the callback landing on the right workspace and nowhere else, tokens kept
 * encrypted and refreshed exactly once however many requests race, meetings made once per
 * booking and only on the caller's own account, the webhook door, and disconnect.
 * Zoom's real behaviour is only proven by connecting a real account in production.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const WEBHOOK_SECRET = "zoom-webhook-secret-for-tests";

type Call = { method: string; url: string; auth: string | null; body: Record<string, unknown> };
let calls: Call[] = [];
type Handler = (call: Call) => Response | Promise<Response>;
let routes: Record<string, Handler> = {};
let meetingSeq = 800000000;

async function workspace(name: string) {
  const s = stamp();
  const biz = await prisma.business.create({ data: { name, handle: `${name.toLowerCase().replace(/\W+/g, "-")}-${s}`, planTier: "PRO", billingStatus: "ACTIVE", timezone: "America/New_York" } });
  const user = await prisma.user.create({ data: { name: `${name} Owner`, email: `${name.toLowerCase().replace(/\W+/g, "-")}-${s}@example.test`, passwordHash: "x" } });
  await prisma.orgMembership.create({ data: { userId: user.id, businessId: biz.id, role: "OWNER" } });
  const service = await prisma.service.create({ data: { businessId: biz.id, name: "Consultation", priceCents: 10000, durationMins: 60 } });
  const client = await prisma.client.create({ data: { businessId: biz.id, name: "Jamie Client", email: `jamie-${s}@example.test` } });
  return { businessId: biz.id, userId: user.id, serviceId: service.id, clientId: client.id, session: { userId: user.id, activeBusinessId: biz.id } };
}

async function booking(w: Awaited<ReturnType<typeof workspace>>, opts: { hoursFromNow?: number; status?: "BOOKED" | "CANCELED" | "COMPLETED"; location?: string | null } = {}) {
  const start = addHours(new Date(), opts.hoursFromNow ?? 24);
  return prisma.booking.create({ data: { businessId: w.businessId, clientId: w.clientId, serviceId: w.serviceId, startAt: start, endAt: addHours(start, 1), status: opts.status ?? "BOOKED", totalCents: 10000, location: opts.location ?? null } });
}

describe("Zoom", () => {
  const ids: string[] = [];
  let a: Awaited<ReturnType<typeof workspace>>;
  let b: Awaited<ReturnType<typeof workspace>>;
  let GET: (req: Request) => Promise<Response>;
  let POST: (req: Request) => Promise<Response>;
  const USER_A = `zu_a_${stamp().replace(/\W/g, "")}`;
  const USER_B = `zu_b_${stamp().replace(/\W/g, "")}`;
  const ACCOUNT_A = "acct_A";
  const ACCOUNT_B = "acct_B";
  let who = { id: USER_A, account_id: ACCOUNT_A, email: "owner-a@zoom.example" };

  const signed = (body: string, opts: { secret?: string; ts?: string } = {}) => {
    const ts = opts.ts ?? String(Date.now());
    const sig = `v0=${createHmac("sha256", opts.secret ?? WEBHOOK_SECRET).update(`v0:${ts}:${body}`).digest("hex")}`;
    return new Request("http://localhost/api/webhooks/zoom", { method: "POST", body, headers: { "content-type": "application/json", "x-zm-signature": sig, "x-zm-request-timestamp": ts } });
  };

  const defaultRoutes = (): Record<string, Handler> => ({
    "POST https://zoom.us/oauth/token": (c) => {
      if (c.body.grant_type === "authorization_code") {
        if (c.body.code === "bad") return json({ reason: "Invalid authorization code", error: "invalid_request" }, 400);
        if (c.body.code === "no-refresh") return json({ access_token: "at-norefresh", token_type: "bearer", expires_in: 3599, scope: ZOOM_SCOPES.join(" ") });
        return json({ access_token: `at-${c.body.code}`, refresh_token: `rt-${c.body.code}`, token_type: "bearer", expires_in: 3599, scope: ZOOM_SCOPES.join(" ") });
      }
      return json({ error: "unsupported" }, 400);
    },
    "POST https://zoom.us/oauth/revoke": () => json({ status: "success" }),
    "GET https://api.zoom.us/v2/users/me": () => json({ ...who, display_name: "Owner", first_name: "O", last_name: "W" }),
    "POST https://api.zoom.us/v2/users/me/meetings": (c) => json({ id: ++meetingSeq, join_url: `https://us06web.zoom.us/j/${meetingSeq}?pwd=abc`, start_url: `https://us06web.zoom.us/s/${meetingSeq}?zak=SECRET`, topic: c.body.topic, start_time: c.body.start_time, duration: c.body.duration }, 201),
    "GET https://api.zoom.us/v2/meetings/*": (c) => json({ id: Number(c.url.split("/").pop()), start_url: `https://us06web.zoom.us/s/${c.url.split("/").pop()}?zak=HOSTKEY` }),
    "PATCH https://api.zoom.us/v2/meetings/*": () => new Response(null, { status: 204 }),
    "DELETE https://api.zoom.us/v2/meetings/*": () => new Response(null, { status: 204 }),
  });

  beforeAll(async () => {
    vi.stubEnv("ZOOM_CLIENT_ID", "zoom-client-id");
    vi.stubEnv("ZOOM_CLIENT_SECRET", "zoom-client-secret-value");
    vi.stubEnv("ZOOM_WEBHOOK_SECRET_TOKEN", WEBHOOK_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://daythread.org");
    a = await workspace("Zoom One");
    b = await workspace("Zoom Two");
    ids.push(a.businessId, b.businessId);
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers as HeadersInit | undefined);
      const raw = init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? "");
      const body = raw.startsWith("{") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
      const call = { method, url, auth: headers.get("authorization"), body };
      calls.push(call);
      const exact = routes[`${method} ${url.split("?")[0]}`];
      const wild = routes[`${method} ${url.split("?")[0].replace(/\/[^/]+$/, "/*")}`];
      const handler = exact ?? wild;
      if (!handler) return json({ code: 404, message: "no stub" }, 404);
      return handler(call);
    });
    ({ GET } = await import("@/app/api/auth/zoom/callback/route"));
    ({ POST } = await import("@/app/api/webhooks/zoom/route"));
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
    routes = defaultRoutes();
    who = { id: USER_A, account_id: ACCOUNT_A, email: "owner-a@zoom.example" };
  });

  const row = (businessId: string) => prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "ZOOM" } } });

  // The browser half of the flow: the signed state and its nonce cookie, plus the PKCE
  // verifier cookie that Connect would have set.
  const startFlow = async (w: typeof a) => {
    const state = await signOAuthState({ provider: "zoom", purpose: "meetings", businessId: w.businessId, userId: w.userId });
    jar.set("zoom_oauth_pkce", "v".repeat(64));
    current.session = w.session;
    return state;
  };
  const callback = (state: string, code = `code${stamp().replace(/\W/g, "")}`) => GET(new Request(`http://localhost/api/auth/zoom/callback?code=${code}&state=${encodeURIComponent(state)}`));
  const connect = async (w: typeof a, code: string, user = { id: USER_A, account_id: ACCOUNT_A, email: "owner-a@zoom.example" }) => {
    who = user;
    const res = await callback(await startFlow(w), code);
    who = { id: USER_A, account_id: ACCOUNT_A, email: "owner-a@zoom.example" };
    return res;
  };

  // ── consent ───────────────────────────────────────────────────────────────

  it("builds a PKCE consent URL on Zoom's host with the exact redirect, and never the secret", () => {
    const url = new URL(zoomAuthUrl("state-1", "challenge-1"));
    expect(url.origin + url.pathname).toBe("https://zoom.us/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("zoom-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://daythread.org/api/auth/zoom/callback");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.toString()).not.toContain("zoom-client-secret-value");
  });

  it("Connect requires a session and an owner or admin, and sets a PKCE verifier cookie", async () => {
    await expect(connectZoom(null)).rejects.toThrow(/unauthorized/);
    const staff = await prisma.user.create({ data: { name: "Staff", email: `staff-${stamp()}@example.test`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: staff.id, businessId: a.businessId, role: "PHOTOGRAPHER" } });
    await expect(connectZoom({ userId: staff.id, activeBusinessId: a.businessId })).rejects.toThrow(/unauthorized/);
    await expect(connectZoom(a.session)).rejects.toThrow(/NEXT_REDIRECT:https:\/\/zoom\.us\/oauth\/authorize/);
    expect(jar.get("zoom_oauth_pkce")).toBeTruthy();
    expect(jar.get("zoom_oauth_nonce")).toBeTruthy();
  });

  // ── the callback ──────────────────────────────────────────────────────────

  it("a valid callback stores the connection on the right workspace, encrypted, with Basic client auth and the verifier", async () => {
    const res = await connect(a, "good");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("connected=ZOOM");
    const r = await row(a.businessId);
    expect(r?.status).toBe("CONNECTED");
    expect(r?.externalId).toBe(USER_A);
    expect(r?.externalAccount).toBe("owner-a@zoom.example");
    expect(r?.accessToken).toBe("at-good");
    expect(r?.refreshToken).toBe("rt-good");
    expect(r?.settings).toMatchObject({ accountId: ACCOUNT_A });
    const exchange = calls.find((c) => c.url === "https://zoom.us/oauth/token");
    expect(exchange?.auth).toBe(`Basic ${Buffer.from("zoom-client-id:zoom-client-secret-value").toString("base64")}`);
    expect(exchange?.body.code_verifier).toBe("v".repeat(64));
    expect(exchange?.body.redirect_uri).toBe("https://daythread.org/api/auth/zoom/callback");
    expect(JSON.stringify(exchange?.body)).not.toContain("zoom-client-secret-value");
    const raw = await prisma.$queryRaw<Array<{ accessToken: string | null; refreshToken: string | null }>>`SELECT "accessToken", "refreshToken" FROM "Integration" WHERE "id" = ${r!.id}`;
    if (process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY) {
      expect(raw[0].accessToken).not.toBe("at-good");
      expect(raw[0].refreshToken).not.toBe("rt-good");
    }
    expect(await row(b.businessId)).toBeNull();
  });

  it("missing, forged, expired, replayed, cross-session, denied and PKCE-less callbacks connect nothing", async () => {
    // Missing state.
    expect((await GET(new Request("http://localhost/api/auth/zoom/callback?code=c"))).headers.get("location")).toContain("connect_error=state");
    // A state for another provider.
    const slackState = await signOAuthState({ provider: "slack", purpose: "notifications", businessId: b.businessId, userId: b.userId });
    jar.set("zoom_oauth_pkce", "v".repeat(64));
    current.session = b.session;
    expect((await callback(slackState)).headers.get("location")).toContain("connect_error=state");
    // Expired.
    const { state: old, nonce } = await signOAuthStateRaw({ provider: "zoom", purpose: "meetings", businessId: b.businessId, userId: b.userId, expiresIn: "-1s" });
    jar.set("zoom_oauth_nonce", nonce);
    jar.set("zoom_oauth_pkce", "v".repeat(64));
    expect((await callback(old)).headers.get("location")).toMatch(/connect_error=(expired|state)/);
    // Replayed: the nonce cookie is single use.
    const once = await startFlow(b);
    jar.delete("zoom_oauth_nonce");
    expect((await callback(once)).headers.get("location")).toContain("connect_error=state");
    // Finished by someone signed in to a different workspace.
    const bState = await startFlow(b);
    current.session = a.session;
    expect((await callback(bState)).headers.get("location")).toContain("connect_error=session");
    // No PKCE verifier.
    const noPkce = await startFlow(b);
    jar.delete("zoom_oauth_pkce");
    expect((await callback(noPkce)).headers.get("location")).toContain("connect_error=state");
    // User pressed Decline at Zoom.
    expect((await GET(new Request("http://localhost/api/auth/zoom/callback?error=access_denied&state=x"))).headers.get("location")).toContain("connect_error=denied");
    expect(await row(b.businessId)).toBeNull();
    expect(calls.filter((c) => c.url === "https://zoom.us/oauth/token")).toHaveLength(0);
  });

  it("an exchange Zoom refuses, a grant without a refresh token, and an unreachable Zoom connect nothing", async () => {
    expect((await callback(await startFlow(b), "bad")).headers.get("location")).toContain("connect_error");
    expect(await row(b.businessId)).toBeNull();
    const res = await callback(await startFlow(b), "no-refresh");
    expect(res.headers.get("location")).toContain("connect_error=no_refresh_token");
    expect(await row(b.businessId).then((r) => r?.status ?? "NOT_CONNECTED")).toBe("NOT_CONNECTED");
    routes["POST https://zoom.us/oauth/token"] = () => { throw new TypeError("fetch failed"); };
    expect((await callback(await startFlow(b), "offline")).headers.get("location")).toContain("connect_error");
    expect(await row(b.businessId).then((r) => r?.status ?? "NOT_CONNECTED")).toBe("NOT_CONNECTED");
  });

  it("the same Zoom user cannot be connected to a second workspace", async () => {
    const res = await connect(b, "steal", { id: USER_A, account_id: ACCOUNT_A, email: "owner-a@zoom.example" });
    expect(res.headers.get("location")).toContain("connect_error=in_use");
    expect(await row(b.businessId).then((r) => r?.accessToken ?? null)).toBeNull();
    expect((await row(a.businessId))?.accessToken).toBe("at-good");
  });

  it("reconnecting replaces the tokens on the same row and gives the old grant back", async () => {
    const before = await row(a.businessId);
    const res = await connect(a, "again");
    expect(res.headers.get("location")).toContain("connected=ZOOM");
    const after = await row(a.businessId);
    expect(after?.id).toBe(before?.id);
    expect(after?.accessToken).toBe("at-again");
    expect(after?.refreshToken).toBe("rt-again");
    expect(calls.some((c) => c.url === "https://zoom.us/oauth/revoke" && c.body.token === "at-good")).toBe(true);
    expect(await prisma.integration.count({ where: { businessId: a.businessId, provider: "ZOOM" } })).toBe(1);
  });

  // ── tokens ────────────────────────────────────────────────────────────────

  it("a fresh token is used as is; an expired one is refreshed once and the rotated refresh token saved", async () => {
    let r = (await row(a.businessId))!;
    expect(await zoomToken(r)).toBe("at-again");
    expect(calls.filter((c) => c.url === "https://zoom.us/oauth/token")).toHaveLength(0);

    await prisma.integration.update({ where: { id: r.id }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });
    r = (await row(a.businessId))!;
    routes["POST https://zoom.us/oauth/token"] = (c) => c.body.refresh_token === "rt-again" ? json({ access_token: "at-rotated", refresh_token: "rt-rotated", expires_in: 3599 }) : json({ reason: "Invalid Token!", error: "invalid_grant" }, 400);
    expect(await zoomToken(r)).toBe("at-rotated");
    const saved = await row(a.businessId);
    expect(saved?.refreshToken).toBe("rt-rotated");
    expect(saved!.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
  });

  it("concurrent requests with an expired token refresh exactly once, so rotation cannot burn the connection", async () => {
    await prisma.integration.update({ where: { businessId_provider: { businessId: a.businessId, provider: "ZOOM" } }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });
    const stale = (await row(a.businessId))!;
    let used = new Set<string>();
    routes["POST https://zoom.us/oauth/token"] = async (c) => {
      const rt = String(c.body.refresh_token);
      await new Promise((res) => setTimeout(res, 40));
      // Zoom's rotation: a refresh token works once.
      if (rt !== "rt-rotated" || used.has(rt)) return json({ reason: "Invalid Token!", error: "invalid_grant" }, 400);
      used.add(rt);
      return json({ access_token: "at-r2", refresh_token: "rt-r2", expires_in: 3599 });
    };
    const results = await Promise.all(Array.from({ length: 5 }, () => zoomToken(stale)));
    expect(new Set(results)).toEqual(new Set(["at-r2"]));
    expect(calls.filter((c) => c.url === "https://zoom.us/oauth/token")).toHaveLength(1);
    expect((await row(a.businessId))?.refreshToken).toBe("rt-r2");
    used = new Set();
  });

  it("a refresh Zoom refuses surfaces as a revoked grant with a sentence, never a token", async () => {
    await prisma.integration.update({ where: { businessId_provider: { businessId: a.businessId, provider: "ZOOM" } }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });
    routes["POST https://zoom.us/oauth/token"] = () => json({ reason: "Invalid Token!", error: "invalid_grant" }, 400);
    const err = await zoomToken((await row(a.businessId))!).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthError);
    expect((err as OAuthError).revoked).toBe(true);
    expect(userFacingZoomError(err)).toMatch(/reconnect/i);
    expect(userFacingZoomError(err)).not.toMatch(/rt-|at-/);
    // Restore a healthy token for the meeting tests.
    await prisma.integration.update({ where: { businessId_provider: { businessId: a.businessId, provider: "ZOOM" } }, data: { accessToken: "at-live", refreshToken: "rt-live", tokenExpiresAt: new Date(Date.now() + 3600_000), status: "CONNECTED" } });
  });

  // ── meetings ──────────────────────────────────────────────────────────────

  it("creates one scheduled meeting for a booking with safe settings, stores only the join link, and puts it in the location", async () => {
    const bk = await booking(a);
    const r = await createZoomMeeting(bk.id, a.session);
    expect(r).toMatchObject({ ok: true, created: true });
    const post = calls.find((c) => c.method === "POST" && c.url === "https://api.zoom.us/v2/users/me/meetings");
    expect(post?.auth).toBe("Bearer at-live");
    expect(post?.body).toMatchObject({ type: 2, duration: 60, timezone: "America/New_York", settings: { join_before_host: false, waiting_room: true } });
    expect(String(post?.body.topic)).toContain("Consultation");
    const saved = await prisma.booking.findUnique({ where: { id: bk.id } });
    expect(saved?.meetingProvider).toBe("ZOOM");
    expect(saved?.meetingExternalId).toMatch(/^\d{9,12}$/);
    expect(saved?.meetingJoinUrl).toMatch(/^https:\/\/us06web\.zoom\.us\/j\//);
    expect(saved?.location).toBe(saved?.meetingJoinUrl);
    // The host's start link (a credential) is stored nowhere on the booking.
    expect(JSON.stringify(saved)).not.toContain("zak=");
    expect(await prisma.auditLog.count({ where: { businessId: a.businessId, action: "booking.meeting_created", targetId: bk.id } })).toBe(1);
  });

  it("pressing Create twice, or twenty times at once, makes exactly one meeting", async () => {
    const bk = await booking(a, { location: "Studio, 1 Main St" });
    routes["POST https://api.zoom.us/v2/users/me/meetings"] = async (c) => {
      await new Promise((res) => setTimeout(res, 60));
      return json({ id: ++meetingSeq, join_url: `https://us06web.zoom.us/j/${meetingSeq}`, topic: c.body.topic }, 201);
    };
    const results = await Promise.all(Array.from({ length: 20 }, () => createZoomMeeting(bk.id, a.session)));
    expect(calls.filter((c) => c.url === "https://api.zoom.us/v2/users/me/meetings")).toHaveLength(1);
    expect(results.filter((x) => x.ok && x.created)).toHaveLength(1);
    const again = await createZoomMeeting(bk.id, a.session);
    expect(again).toMatchObject({ ok: true, created: false });
    expect(calls.filter((c) => c.url === "https://api.zoom.us/v2/users/me/meetings")).toHaveLength(1);
    // A typed address is never overwritten.
    expect((await prisma.booking.findUnique({ where: { id: bk.id } }))?.location).toBe("Studio, 1 Main St");
  });

  it("a Zoom failure, a timeout or an untrustworthy answer leaves the booking free to try again", async () => {
    const bk = await booking(a);
    routes["POST https://api.zoom.us/v2/users/me/meetings"] = () => json({ code: 3001, message: "Meeting does not exist: jamie@example.test" }, 400);
    const r1 = await createZoomMeeting(bk.id, a.session);
    expect(r1.ok).toBe(false);
    expect(JSON.stringify(r1)).not.toContain("jamie@");
    routes["POST https://api.zoom.us/v2/users/me/meetings"] = () => { const e = new Error("The operation timed out"); e.name = "TimeoutError"; throw e; };
    const r2 = await createZoomMeeting(bk.id, a.session);
    expect(r2).toMatchObject({ ok: false, error: expect.stringMatching(/in time/i) });
    routes["POST https://api.zoom.us/v2/users/me/meetings"] = () => json({ id: 123, join_url: "https://evil.example/j/1" }, 201);
    expect((await createZoomMeeting(bk.id, a.session)).ok).toBe(false);
    let saved = await prisma.booking.findUnique({ where: { id: bk.id } });
    expect(saved?.meetingProvider).toBeNull();
    expect(saved?.location).toBeNull();
    routes = defaultRoutes();
    expect(await createZoomMeeting(bk.id, a.session)).toMatchObject({ ok: true, created: true });
    saved = await prisma.booking.findUnique({ where: { id: bk.id } });
    expect(saved?.meetingJoinUrl).toMatch(/zoom\.us/);
  });

  it("a revoked Zoom grant marks the connection as needing attention", async () => {
    const bk = await booking(a);
    routes["POST https://api.zoom.us/v2/users/me/meetings"] = () => json({ code: 124, message: "Invalid access token." }, 401);
    const r = await createZoomMeeting(bk.id, a.session);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/reconnect/i) });
    expect((await row(a.businessId))?.status).toBe("NEEDS_ATTENTION");
    await prisma.integration.update({ where: { businessId_provider: { businessId: a.businessId, provider: "ZOOM" } }, data: { status: "CONNECTED", lastError: null } });
  });

  it("no connection, a canceled or past booking, a bad id and a client or partner are all refused", async () => {
    const bBooking = await booking(b);
    expect(await createZoomMeeting(bBooking.id, b.session)).toMatchObject({ ok: false, error: expect.stringMatching(/connect zoom/i) });
    expect(await createZoomMeeting((await booking(a, { status: "CANCELED" })).id, a.session)).toMatchObject({ ok: false });
    expect(await createZoomMeeting((await booking(a, { hoursFromNow: -5 })).id, a.session)).toMatchObject({ ok: false });
    expect(await createZoomMeeting("../../users/me", a.session)).toMatchObject({ ok: false });
    expect(await createZoomMeeting({ id: "x" }, a.session)).toMatchObject({ ok: false });
    expect(await createZoomMeeting((await booking(a)).id, null)).toMatchObject({ ok: false, error: "unauthorized" });
    for (const role of ["PARTNER", "CLIENT"] as const) {
      const u = await prisma.user.create({ data: { name: role, email: `${role.toLowerCase()}-${stamp()}@example.test`, passwordHash: "x" } });
      await prisma.orgMembership.create({ data: { userId: u.id, businessId: a.businessId, role } });
      const s = { userId: u.id, activeBusinessId: a.businessId };
      const bk = await booking(a);
      expect(await createZoomMeeting(bk.id, s)).toMatchObject({ ok: false, error: "unauthorized" });
      expect(await startZoomMeeting(bk.id, s)).toMatchObject({ ok: false, error: "unauthorized" });
      expect(await removeZoomMeeting(bk.id, s)).toMatchObject({ ok: false, error: "unauthorized" });
    }
    expect(calls.filter((c) => c.url.startsWith("https://api.zoom.us"))).toHaveLength(0);
  });

  it("workspace B can neither create, start nor remove a meeting on workspace A's booking, and never uses A's token", async () => {
    // B connects its own Zoom user.
    await connect(b, "bcode", { id: USER_B, account_id: ACCOUNT_B, email: "owner-b@zoom.example" });
    expect((await row(b.businessId))?.status).toBe("CONNECTED");
    const aBooking = await booking(a);
    const made = await createZoomMeeting(aBooking.id, a.session);
    expect(made.ok).toBe(true);
    calls = [];
    expect(await createZoomMeeting(aBooking.id, b.session)).toMatchObject({ ok: false });
    expect(await startZoomMeeting(aBooking.id, b.session)).toMatchObject({ ok: false });
    expect(await removeZoomMeeting(aBooking.id, b.session)).toMatchObject({ ok: false });
    expect(calls.filter((c) => c.url.startsWith("https://api.zoom.us"))).toHaveLength(0);
    const still = await prisma.booking.findUnique({ where: { id: aBooking.id } });
    expect(still?.meetingExternalId).toBeTruthy();
    // B's own booking goes to B's own Zoom token.
    const bBooking = await booking(b);
    await createZoomMeeting(bBooking.id, b.session);
    expect(calls.filter((c) => c.url === "https://api.zoom.us/v2/users/me/meetings").map((c) => c.auth)).toEqual(["Bearer at-bcode"]);
  });

  it("Start fetches a fresh host link from Zoom and never stores it", async () => {
    const bk = await booking(a);
    await createZoomMeeting(bk.id, a.session);
    const r = await startZoomMeeting(bk.id, a.session);
    expect(r).toMatchObject({ ok: true, url: expect.stringMatching(/^https:\/\/us06web\.zoom\.us\/s\/\d+\?zak=HOSTKEY$/) });
    const saved = await prisma.booking.findUnique({ where: { id: bk.id } });
    expect(JSON.stringify(saved)).not.toContain("HOSTKEY");
    expect(await startZoomMeeting((await booking(a)).id, a.session)).toMatchObject({ ok: false });
    // A start link on a non-Zoom host is refused.
    routes["GET https://api.zoom.us/v2/meetings/*"] = () => json({ start_url: "https://evil.example/s/1" });
    expect(await startZoomMeeting(bk.id, a.session)).toMatchObject({ ok: false });
  });

  it("a stored id that is not a Zoom meeting id is never put into a request path", async () => {
    const bk = await booking(a);
    await prisma.booking.update({ where: { id: bk.id }, data: { meetingProvider: "ZOOM", meetingExternalId: "../users/me", meetingJoinUrl: "https://zoom.us/j/1" } });
    calls = [];
    expect(await startZoomMeeting(bk.id, a.session)).toMatchObject({ ok: false });
    expect((await removeZoomMeeting(bk.id, a.session)).ok).toBe(false);
    expect(calls.filter((c) => c.url.includes("users/me") && c.method !== "GET")).toHaveLength(0);
    expect(calls.some((c) => c.url.includes(".."))).toBe(false);
  });

  it("rescheduling moves the meeting at Zoom; a Zoom failure never blocks the move", async () => {
    const bk = await booking(a);
    await createZoomMeeting(bk.id, a.session);
    const saved = (await prisma.booking.findUnique({ where: { id: bk.id } }))!;
    const newStart = addHours(saved.startAt, 48);
    await prisma.booking.update({ where: { id: bk.id }, data: { startAt: newStart, endAt: addHours(newStart, 2) } });
    calls = [];
    await moveMeetingForBooking(a.businessId, bk.id);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.url).toBe(`https://api.zoom.us/v2/meetings/${saved.meetingExternalId}`);
    expect(patch?.body).toMatchObject({ duration: 120, timezone: "America/New_York", start_time: newStart.toISOString().replace(/\.\d{3}Z$/, "Z") });
    routes["PATCH https://api.zoom.us/v2/meetings/*"] = () => json({ code: 500 }, 500);
    await expect(moveMeetingForBooking(a.businessId, bk.id)).resolves.toBeUndefined();
    // Another workspace's id does nothing.
    calls = [];
    await moveMeetingForBooking(b.businessId, bk.id);
    expect(calls).toHaveLength(0);
  });

  it("Remove deletes at Zoom and clears the booking; a meeting Zoom already lost counts as removed", async () => {
    const bk = await booking(a);
    await createZoomMeeting(bk.id, a.session);
    const id = (await prisma.booking.findUnique({ where: { id: bk.id } }))!.meetingExternalId;
    expect(await removeZoomMeeting(bk.id, a.session)).toEqual({ ok: true });
    expect(calls.some((c) => c.method === "DELETE" && c.url === `https://api.zoom.us/v2/meetings/${id}`)).toBe(true);
    const cleared = await prisma.booking.findUnique({ where: { id: bk.id } });
    expect(cleared).toMatchObject({ meetingProvider: null, meetingExternalId: null, meetingJoinUrl: null, location: null });

    const bk2 = await booking(a);
    await createZoomMeeting(bk2.id, a.session);
    routes["DELETE https://api.zoom.us/v2/meetings/*"] = () => json({ code: 3001, message: "Meeting does not exist" }, 404);
    expect(await removeZoomMeeting(bk2.id, a.session)).toEqual({ ok: true });
    // Zoom refusing for another reason keeps the meeting on the booking and says so.
    const bk3 = await booking(a);
    routes = defaultRoutes();
    await createZoomMeeting(bk3.id, a.session);
    routes["DELETE https://api.zoom.us/v2/meetings/*"] = () => json({ code: 500 }, 500);
    expect((await removeZoomMeeting(bk3.id, a.session)).ok).toBe(false);
    expect((await prisma.booking.findUnique({ where: { id: bk3.id } }))?.meetingExternalId).toBeTruthy();
  });

  it("canceling a booking removes its meeting, even when Zoom is down", async () => {
    const bk = await booking(a);
    await createZoomMeeting(bk.id, a.session);
    routes["DELETE https://api.zoom.us/v2/meetings/*"] = () => json({ code: 500 }, 503);
    expect(await cancelBooking(bk.id, a.session)).toEqual({ ok: true });
    const r = await prisma.booking.findUnique({ where: { id: bk.id } });
    expect(r?.status).toBe("CANCELED");
    expect(r?.meetingJoinUrl).toBeNull();
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("the meeting body clamps durations and strips control characters from the topic", () => {
    const body = meetingBody({ topic: "Hi\u0000\u001b there", startTime: new Date("2030-01-01T10:00:00.123Z"), durationMins: 99999, timezone: "UTC" });
    expect(body.topic).toBe("Hi   there");
    expect(body.duration).toBe(1440);
    expect(body.start_time).toBe("2030-01-01T10:00:00Z");
    expect(meetingBody({ topic: "", startTime: new Date(), durationMins: 1, timezone: "UTC" })).toMatchObject({ topic: "Meeting", duration: 5 });
  });

  it("the raw create helper refuses answers with a non-numeric id", async () => {
    routes["POST https://api.zoom.us/v2/users/me/meetings"] = () => json({ id: "abc/../x", join_url: "https://zoom.us/j/1" }, 201);
    await expect(createAtZoom("t", { topic: "x", startTime: new Date(), durationMins: 30, timezone: "UTC" })).rejects.toBeInstanceOf(OAuthError);
  });

  // ── webhooks ──────────────────────────────────────────────────────────────

  it("verifies v0=HMAC(v0:timestamp:body) exactly, within five minutes, in seconds or milliseconds", () => {
    const body = JSON.stringify({ event: "app_deauthorized" });
    const ms = String(Date.now());
    const sig = (ts: string, secret = WEBHOOK_SECRET, b = body) => `v0=${createHmac("sha256", secret).update(`v0:${ts}:${b}`).digest("hex")}`;
    expect(verifyZoomSignature(body, sig(ms), ms)).toBe(true);
    const s = String(Math.floor(Date.now() / 1000));
    expect(verifyZoomSignature(body, sig(s), s)).toBe(true);
    expect(verifyZoomSignature(`${body} `, sig(ms), ms)).toBe(false);
    expect(verifyZoomSignature(body, sig(ms, "other"), ms)).toBe(false);
    expect(verifyZoomSignature(body, sig(ms).replace("v0=", "v1="), ms)).toBe(false);
    expect(verifyZoomSignature(body, null, ms)).toBe(false);
    expect(verifyZoomSignature(body, sig(ms), null)).toBe(false);
    expect(verifyZoomSignature(body, sig("abc"), "abc")).toBe(false);
    const old = String(Date.now() - 10 * 60_000);
    expect(verifyZoomSignature(body, sig(old), old)).toBe(false);
    expect(verifyZoomSignature(body, sig(ms), ms, { secret: null })).toBe(false);
  });

  it("answers Zoom's URL validation only when signed", async () => {
    const body = JSON.stringify({ event: "endpoint.url_validation", payload: { plainToken: "plain-123" }, event_ts: Date.now() });
    const r = await POST(signed(body));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ plainToken: "plain-123", encryptedToken: createHmac("sha256", WEBHOOK_SECRET).update("plain-123").digest("hex") });
    expect(zoomUrlValidationResponse("x", null)).toBeNull();
    const unsigned = await POST(new Request("http://localhost/api/webhooks/zoom", { method: "POST", body, headers: { "content-type": "application/json" } }));
    expect(unsigned.status).toBe(401);
    expect((await POST(signed(JSON.stringify({ event: "endpoint.url_validation", payload: { plainToken: 42 } })))).status).toBe(400);
    expect((await POST(signed(JSON.stringify({ event: "endpoint.url_validation", payload: { plainToken: "x".repeat(300) } })))).status).toBe(400);
  });

  it("forged, stale, malformed, oversized, unrelated and mismatched events change nothing", async () => {
    const before = await row(b.businessId);
    const deauth = JSON.stringify({ event: "app_deauthorized", event_ts: Date.now(), payload: { account_id: ACCOUNT_B, user_id: USER_B, signature: `sig-${stamp()}`, deauthorization_time: new Date().toISOString(), client_id: "zoom-client-id" } });
    expect((await POST(signed(deauth, { secret: "wrong" }))).status).toBe(401);
    expect((await POST(signed(deauth, { ts: String(Date.now() - 15 * 60_000) }))).status).toBe(401);
    expect((await POST(signed("not json"))).status).toBe(400);
    expect((await POST(signed(JSON.stringify({ event: "app_deauthorized", payload: { user_id: USER_B } })))).status).toBe(400);
    expect((await POST(signed(JSON.stringify({ event: "x", pad: "y".repeat(70 * 1024) })))).status).toBe(413);
    expect(await (await POST(signed(JSON.stringify({ event: "meeting.started", payload: {} })))).json()).toMatchObject({ ignored: "meeting.started" });
    // The right user id with somebody else's account id is not B's connection.
    const mismatch = JSON.stringify({ event: "app_deauthorized", payload: { account_id: ACCOUNT_A, user_id: USER_B, signature: `sig-${stamp()}` } });
    expect((await POST(signed(mismatch))).status).toBe(200);
    const after = await row(b.businessId);
    expect(after?.status).toBe(before?.status);
    expect(after?.accessToken).toBe(before?.accessToken);
  });

  it("a deauthorization for workspace B erases B's tokens only, and a retry is a no-op", async () => {
    const aBefore = await row(a.businessId);
    const body = JSON.stringify({ event: "app_deauthorized", event_ts: Date.now(), payload: { account_id: ACCOUNT_B, user_id: USER_B, signature: `sig-${stamp()}`, deauthorization_time: new Date().toISOString(), client_id: "zoom-client-id" } });
    const first = await POST(signed(body));
    expect(first.status).toBe(200);
    const r = await row(b.businessId);
    expect(r).toMatchObject({ status: "NOT_CONNECTED", accessToken: null, refreshToken: null, externalId: null });
    expect(r?.lastError).toMatch(/removed from your Zoom/i);
    expect(await (await POST(signed(body))).json()).toMatchObject({ duplicate: true });
    const aAfter = await row(a.businessId);
    expect(aAfter?.status).toBe(aBefore?.status);
    expect(aAfter?.accessToken).toBe(aBefore?.accessToken);
    expect(await prisma.auditLog.count({ where: { businessId: b.businessId, action: "integration.revoked_by_provider" } })).toBe(1);
    // B's meetings can no longer be started with a token that is gone.
    const bBooking = await prisma.booking.findFirst({ where: { businessId: b.businessId, meetingExternalId: { not: null } } });
    expect(await startZoomMeeting(bBooking!.id, b.session)).toMatchObject({ ok: false, error: expect.stringMatching(/reconnect/i) });
  });

  it("the webhook is closed when no secret is configured", async () => {
    vi.stubEnv("ZOOM_WEBHOOK_SECRET_TOKEN", "");
    expect((await POST(signed(JSON.stringify({ event: "endpoint.url_validation", payload: { plainToken: "p" } })))).status).toBe(501);
    vi.stubEnv("ZOOM_WEBHOOK_SECRET_TOKEN", WEBHOOK_SECRET);
  });

  // ── disconnect ────────────────────────────────────────────────────────────

  it("disconnecting revokes at Zoom and empties the row; another workspace's disconnect touches only its own", async () => {
    await disconnectIntegration("ZOOM", b.session);
    expect((await row(a.businessId))?.status).toBe("CONNECTED");
    const token = (await row(a.businessId))!.accessToken;
    calls = [];
    await disconnectIntegration("ZOOM", a.session);
    const revoke = calls.find((c) => c.url === "https://zoom.us/oauth/revoke");
    expect(revoke?.body.token).toBe(token);
    expect(revoke?.auth).toMatch(/^Basic /);
    const r = await row(a.businessId);
    expect(r).toMatchObject({ status: "NOT_CONNECTED", accessToken: null, refreshToken: null });
    const bk = await booking(a);
    expect(await createZoomMeeting(bk.id, a.session)).toMatchObject({ ok: false, error: expect.stringMatching(/connect zoom/i) });
  });
});
