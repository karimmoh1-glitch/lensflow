import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { signOAuthStateRaw } from "@/lib/integrations/oauthState";

/**
 * The Instagram Login callback with Meta replaced by recorded responses. Exercises the
 * security matrix: replayed state, expired state, forged state, wrong session, wrong tenant,
 * a personal (non-professional) account, an account already connected elsewhere, the plan
 * quota, and encryption at rest. The only network is the mocked fetch.
 */
const cookieStore = { nonce: null as string | null };
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "instagram_oauth_nonce" && cookieStore.nonce ? { value: cookieStore.nonce } : undefined), set: () => {}, delete: () => { cookieStore.nonce = null; } }) }));
const session = { current: null as { userId: string; activeBusinessId: string } | null };
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getSession: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const profile = { id: "26270000000001", user_id: "17841400000001", username: "karim.photo", account_type: "BUSINESS" };
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.startsWith("https://api.instagram.com/oauth/access_token")) return json({ access_token: "IGQVJ-short", user_id: profile.id });
  if (url.startsWith("https://graph.instagram.com/access_token")) return json({ access_token: "IGQVJ-long-lived-token", expires_in: 5184000 });
  if (url.includes("/me?") || url.includes("/me&")) return json(profile);
  if (url.includes("/subscribed_apps")) return json({ success: true });
  if (url.includes("/conversations")) return json({ data: [{ id: "c1", participants: { data: [{ id: profile.id, username: profile.username }, { id: "igsid_42", username: "sam" }] }, messages: { data: [{ id: "m1", from: { id: "igsid_42", username: "sam" }, message: "Do you shoot weddings?", created_time: "2026-09-05T10:00:00+0000" }] } }] });
  return json({ error: { message: `unexpected ${url}` } }, 500);
});

describe("Instagram callback", () => {
  let GET: (req: Request) => Promise<Response>;
  let businessId: string;
  let otherBusinessId: string;
  let userId: string;
  let strangerId: string;
  const hit = (q: Record<string, string>) => GET(new Request(`http://localhost/api/auth/instagram/callback?${new URLSearchParams(q)}`));
  const location = (r: Response) => new URL(r.headers.get("location")!);
  beforeAll(async () => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("INSTAGRAM_APP_ID", "ig-app");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "ig-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    ({ GET } = await import("./route"));
    const stamp = Date.now();
    businessId = (await prisma.business.create({ data: { name: "IG", handle: `ig-${stamp}`, planTier: "PRO", billingStatus: "ACTIVE" } })).id;
    otherBusinessId = (await prisma.business.create({ data: { name: "IG Other", handle: `ig-other-${stamp}` } })).id;
    userId = (await prisma.user.create({ data: { name: "Owner", email: `ig-own-${stamp}@example.com`, passwordHash: "x" } })).id;
    strangerId = (await prisma.user.create({ data: { name: "Stranger", email: `ig-str-${stamp}@example.com`, passwordHash: "x" } })).id;
    await prisma.orgMembership.create({ data: { userId, businessId, role: "OWNER" } });
    await prisma.orgMembership.create({ data: { userId: strangerId, businessId: otherBusinessId, role: "OWNER" } });
  });
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, strangerId] } } });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  async function state(o: Partial<{ businessId: string; userId: string; expiresIn: string }> = {}) {
    const r = await signOAuthStateRaw({ provider: "instagram", purpose: "messaging", businessId: o.businessId ?? businessId, userId: o.userId ?? userId, ...(o.expiresIn ? { expiresIn: o.expiresIn } : {}) });
    cookieStore.nonce = r.nonce;
    return r.state;
  }

  it("connects: state → session → long-lived token (encrypted) → profile → webhook → first DMs ingested", async () => {
    session.current = { userId, activeBusinessId: businessId };
    const r = await hit({ code: "abc", state: await state() });
    const loc = location(r);
    expect(loc.searchParams.get("connected")).toBe("INSTAGRAM");
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "INSTAGRAM" } } });
    expect(row?.status).toBe("CONNECTED");
    expect(row?.externalId).toBe(profile.user_id);
    expect((row?.settings as { appScopedUserId?: string; professionalAccountId?: string }).appScopedUserId).toBe(profile.id);
    expect((row?.settings as { professionalAccountId?: string }).professionalAccountId).toBe(profile.user_id);
    expect(row?.externalAccount).toBe("@karim.photo");
    expect(row?.accessToken).toBe("IGQVJ-long-lived-token"); // decrypted for the owner…
    const raw = await prisma.$queryRaw<Array<{ accessToken: string }>>`SELECT "accessToken" FROM "Integration" WHERE id = ${row!.id}`;
    expect(raw[0].accessToken).toMatch(/^v1:/); // …ciphertext at rest
    expect(raw[0].accessToken).not.toContain("IGQVJ");
    const convs = await prisma.conversation.findMany({ where: { businessId, channel: "INSTAGRAM" }, include: { messages: true } });
    expect(convs).toHaveLength(1);
    expect(convs[0].externalHandle).toBe("igsid_42");
    expect(convs[0].messages[0].body).toBe("Do you shoot weddings?");
  });

  it("refuses a replayed state, a forged state and an expired state", async () => {
    session.current = { userId, activeBusinessId: businessId };
    const s = await state();
    await hit({ code: "abc", state: s });
    expect(location(await hit({ code: "abc", state: s })).searchParams.get("connect_error")).toBe("state");
    const s2 = await state();
    expect(location(await hit({ code: "abc", state: s2.slice(0, -3) + "xyz" })).searchParams.get("connect_error")).toBe("state");
    const s3 = await state({ expiresIn: "1s" });
    await new Promise((r) => setTimeout(r, 1500));
    expect(location(await hit({ code: "abc", state: s3 })).searchParams.get("connect_error")).toBe("expired");
  });

  it("refuses another user's session and another tenant", async () => {
    session.current = { userId: strangerId, activeBusinessId: otherBusinessId };
    expect(location(await hit({ code: "abc", state: await state() })).searchParams.get("connect_error")).toBe("session");
    session.current = { userId, activeBusinessId: businessId };
    expect(location(await hit({ code: "abc", state: await state({ businessId: otherBusinessId }) })).searchParams.get("connect_error")).toBe("tenant");
    expect(await prisma.integration.count({ where: { businessId: otherBusinessId } })).toBe(0);
  });

  it("refuses a personal account and an account already connected to another workspace", async () => {
    session.current = { userId, activeBusinessId: businessId };
    profile.account_type = "PERSONAL";
    expect(location(await hit({ code: "abc", state: await state() })).searchParams.get("connect_error")).toBe("account_type");
    profile.account_type = "BUSINESS";
    // Same Instagram account already feeds another workspace.
    await prisma.integration.deleteMany({ where: { businessId, provider: "INSTAGRAM" } });
    await prisma.integration.create({ data: { businessId: otherBusinessId, provider: "INSTAGRAM", status: "CONNECTED", externalId: profile.user_id, accessToken: "t" } });
    expect(location(await hit({ code: "abc", state: await state() })).searchParams.get("connect_error")).toBe("in_use");
    await prisma.integration.deleteMany({ where: { businessId: otherBusinessId } });
  });

  it("enforces the connected-integrations quota at the callback", async () => {
    session.current = { userId, activeBusinessId: businessId };
    await prisma.business.update({ where: { id: businessId }, data: { planTier: "FREE", billingStatus: null } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.integration.createMany({ data: [{ businessId, provider: "EMAIL", status: "CONNECTED", refreshToken: "r" }, { businessId, provider: "SMS", status: "CONNECTED" }] });
    expect(location(await hit({ code: "abc", state: await state() })).searchParams.get("connect_error")).toBe("limit");
    expect(await prisma.integration.count({ where: { businessId, provider: "INSTAGRAM" } })).toBe(0);
  });

  it("a canceled authorization connects nothing", async () => {
    expect(location(await hit({ error: "access_denied" })).searchParams.get("connect_error")).toBe("denied");
  });
});
