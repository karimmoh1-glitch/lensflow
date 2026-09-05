import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { signOAuthStateRaw } from "@/lib/integrations/oauthState";

/**
 * The Google Calendar callback end to end with Google itself replaced by recorded
 * responses: token exchange, userinfo, calendar list, and the first sync. Everything
 * else — state verification, session/tenant binding, encryption, settings, redirects —
 * is the real code against the real database.
 */
const cookieStore = { nonce: null as string | null };
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "google_oauth_nonce" && cookieStore.nonce ? { value: cookieStore.nonce } : undefined),
    set: () => {},
    delete: () => {
      cookieStore.nonce = null;
    },
  }),
}));
const session = { current: null as { userId: string; activeBusinessId: string } | null };
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getSession: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const calls: string[] = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "ya29.test-access", refresh_token: "1//test-refresh", expires_in: 3600, scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email", token_type: "Bearer" });
  if (url.startsWith("https://www.googleapis.com/oauth2/v3/userinfo")) return json({ email: "alex@example.com" });
  if (url.includes("/calendar/v3/users/me/calendarList")) return json({ items: [{ id: "alex@example.com", summary: "Alex", primary: true, accessRole: "owner", timeZone: "America/Chicago" }, { id: "work@group.calendar.google.com", summary: "Work", accessRole: "writer", timeZone: "America/Chicago" }, { id: "holidays", summary: "Holidays", accessRole: "reader" }] });
  if (url.includes("/calendar/v3/calendars/") && url.includes("/events")) return json({ items: [{ id: "ev1", status: "confirmed", summary: "Dentist", start: { dateTime: "2026-09-10T14:00:00Z" }, end: { dateTime: "2026-09-10T15:00:00Z" } }], nextSyncToken: "sync-1" });
  if (url.startsWith("https://oauth2.googleapis.com/revoke")) return new Response("", { status: 200 });
  return json({ error: "unexpected" }, 500);
});

describe("Google Calendar callback", () => {
  let GET: (req: Request) => Promise<Response>;
  let businessId: string;
  let otherBusinessId: string;
  let userId: string;
  let strangerId: string;
  beforeAll(async () => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    ({ GET } = await import("./route"));
    const stamp = Date.now();
    businessId = (await prisma.business.create({ data: { name: "GCal", handle: `gcal-${stamp}` } })).id;
    otherBusinessId = (await prisma.business.create({ data: { name: "GCal Other", handle: `gcal-other-${stamp}` } })).id;
    userId = (await prisma.user.create({ data: { name: "Owner", email: `gcal-owner-${stamp}@example.com`, passwordHash: "x" } })).id;
    strangerId = (await prisma.user.create({ data: { name: "Stranger", email: `gcal-stranger-${stamp}@example.com`, passwordHash: "x" } })).id;
    await prisma.orgMembership.create({ data: { userId, businessId, role: "OWNER" } });
    await prisma.orgMembership.create({ data: { userId: strangerId, businessId: otherBusinessId, role: "OWNER" } });
  });
  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.business.delete({ where: { id: otherBusinessId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, strangerId] } } });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const hit = (params: Record<string, string>) => GET(new Request(`http://localhost:3000/api/auth/google/callback?${new URLSearchParams(params)}`));
  const location = (r: Response) => new URL(r.headers.get("location")!);

  it("connects Google Calendar: state → session → tokens (encrypted) → calendars discovered → primary selected → first sync → setup screen", async () => {
    const { state, nonce } = await signOAuthStateRaw({ provider: "google", purpose: "calendar", businessId, userId });
    cookieStore.nonce = nonce;
    session.current = { userId, activeBusinessId: businessId };
    const r = await hit({ code: "auth-code", state });
    const loc = location(r);
    expect(loc.pathname).toBe("/dashboard/settings");
    expect(loc.searchParams.get("setup")).toBe("GOOGLE_CALENDAR");
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "GOOGLE_CALENDAR" } } });
    expect(row?.status).toBe("CONNECTED");
    expect(row?.externalAccount).toBe("alex@example.com");
    expect(row?.refreshToken).toBe("1//test-refresh"); // decrypted for the app…
    const raw = await prisma.$queryRaw<Array<{ refreshToken: string }>>`SELECT "refreshToken" FROM "Integration" WHERE id = ${row!.id}`;
    expect(raw[0].refreshToken).toMatch(/^v1:/); // …encrypted in the database
    expect(raw[0].refreshToken).not.toContain("test-refresh");
    const settings = row!.settings as { available: Array<{ id: string; readOnly?: boolean }>; selected: string[]; bookingCalendar: string | null; cursors: Record<string, string> };
    expect(settings.available.map((c) => c.id)).toEqual(["alex@example.com", "work@group.calendar.google.com", "holidays"]);
    expect(settings.available[2].readOnly).toBe(true);
    expect(settings.selected).toEqual(["alex@example.com"]);
    expect(settings.bookingCalendar).toBe("alex@example.com");
    expect(settings.cursors["alex@example.com"]).toBe("sync-1");
    expect(row?.lastSyncStatus).toBe("ok");
    expect(await prisma.externalEvent.count({ where: { integrationId: row!.id } })).toBe(1);
    expect(calls.some((c) => c.startsWith("POST https://oauth2.googleapis.com/token"))).toBe(true);
  });

  it("rejects a reused state (nonce already consumed) and a forged one", async () => {
    const { state, nonce } = await signOAuthStateRaw({ provider: "google", purpose: "calendar", businessId, userId });
    cookieStore.nonce = nonce;
    session.current = { userId, activeBusinessId: businessId };
    await hit({ code: "c", state });
    cookieStore.nonce = null; // consumed
    const reused = await hit({ code: "c", state });
    expect(location(reused).searchParams.get("connect_error")).toBe("state");
    const forged = await hit({ code: "c", state: state.slice(0, -4) + "zzzz" });
    expect(location(forged).searchParams.get("connect_error")).toBe("state");
  });

  it("rejects an expired state", async () => {
    const { state, nonce } = await signOAuthStateRaw({ provider: "google", purpose: "calendar", businessId, userId, expiresIn: "1s" });
    await new Promise((r) => setTimeout(r, 1200));
    cookieStore.nonce = nonce;
    session.current = { userId, activeBusinessId: businessId };
    expect(location(await hit({ code: "c", state })).searchParams.get("connect_error")).toBe("expired");
  });

  it("refuses to finish a flow for another tenant or from another user's session", async () => {
    const { state, nonce } = await signOAuthStateRaw({ provider: "google", purpose: "calendar", businessId, userId });
    cookieStore.nonce = nonce;
    session.current = { userId: strangerId, activeBusinessId: otherBusinessId };
    expect(location(await hit({ code: "c", state })).searchParams.get("connect_error")).toBe("session");
    const { state: s2, nonce: n2 } = await signOAuthStateRaw({ provider: "google", purpose: "calendar", businessId: otherBusinessId, userId });
    cookieStore.nonce = n2;
    session.current = { userId, activeBusinessId: businessId };
    expect(location(await hit({ code: "c", state: s2 })).searchParams.get("connect_error")).toBe("tenant");
    expect(await prisma.integration.count({ where: { businessId: otherBusinessId } })).toBe(0);
  });

  it("a canceled authorization connects nothing and explains itself", async () => {
    const r = await hit({ error: "access_denied" });
    expect(location(r).searchParams.get("connect_error")).toBe("denied");
  });
});
