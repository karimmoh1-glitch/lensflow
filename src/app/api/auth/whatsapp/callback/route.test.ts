import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { signOAuthStateRaw } from "@/lib/integrations/oauthState";

/** WhatsApp Embedded Signup callback with Meta recorded: WABA discovery, phone number
 * association, webhook subscription, encryption, and the same security matrix. */
const cookieStore = { nonce: null as string | null };
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "whatsapp_oauth_nonce" && cookieStore.nonce ? { value: cookieStore.nonce } : undefined), set: () => {}, delete: () => { cookieStore.nonce = null; } }) }));
const session = { current: null as { userId: string; activeBusinessId: string } | null };
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getSession: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const provider = { wabas: ["waba_1"] as string[], phones: [{ id: "pn_100", display_phone_number: "+1 555 010 0100", verified_name: "Karim Photography" }] as Array<{ id: string; display_phone_number: string; verified_name: string }> };
const calls: string[] = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.includes("/oauth/access_token")) return json({ access_token: "EAAB-business-token", token_type: "bearer" });
  if (url.includes("/debug_token")) return json({ data: { granular_scopes: [{ scope: "whatsapp_business_management", target_ids: provider.wabas }] } });
  if (url.includes("/phone_numbers")) return json({ data: provider.phones });
  if (url.includes("/subscribed_apps")) return json({ success: true });
  if (url.includes("/me/businesses") || url.includes("owned_whatsapp_business_accounts")) return json({ data: provider.wabas.map((id) => ({ id })) });
  return json({ error: { message: `unexpected ${url}` } }, 500);
});

describe("WhatsApp callback", () => {
  let GET: (req: Request) => Promise<Response>;
  let businessId: string;
  let otherBusinessId: string;
  let userId: string;
  const hit = (q: Record<string, string>) => GET(new Request(`http://localhost/api/auth/whatsapp/callback?${new URLSearchParams(q)}`));
  const location = (r: Response) => new URL(r.headers.get("location")!);
  beforeAll(async () => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("META_APP_ID", "meta-app");
    vi.stubEnv("META_APP_SECRET", "meta-secret");
    vi.stubEnv("WHATSAPP_CONFIG_ID", "cfg");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    ({ GET } = await import("./route"));
    const stamp = Date.now();
    businessId = (await prisma.business.create({ data: { name: "WA", handle: `wa-${stamp}`, planTier: "PRO", billingStatus: "ACTIVE" } })).id;
    otherBusinessId = (await prisma.business.create({ data: { name: "WA Other", handle: `wa-other-${stamp}` } })).id;
    userId = (await prisma.user.create({ data: { name: "Owner", email: `wa-own-${stamp}@example.com`, passwordHash: "x" } })).id;
    await prisma.orgMembership.create({ data: { userId, businessId, role: "OWNER" } });
  });
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  async function state(o: Partial<{ businessId: string; expiresIn: string }> = {}) {
    const r = await signOAuthStateRaw({ provider: "whatsapp", purpose: "messaging", businessId: o.businessId ?? businessId, userId, ...(o.expiresIn ? { expiresIn: o.expiresIn } : {}) });
    cookieStore.nonce = r.nonce;
    return r.state;
  }

  it("connects: token → WABA → phone number → webhook subscribed → encrypted at rest", async () => {
    session.current = { userId, activeBusinessId: businessId };
    const r = await hit({ code: "abc", state: await state() });
    expect(location(r).searchParams.get("connected")).toBe("WHATSAPP");
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "WHATSAPP" } } });
    expect(row?.status).toBe("CONNECTED");
    expect(row?.externalId).toBe("pn_100");
    expect((row?.settings as { wabaId?: string })?.wabaId).toBe("waba_1");
    expect(row?.accessToken).toBe("EAAB-business-token");
    const raw = await prisma.$queryRaw<Array<{ accessToken: string }>>`SELECT "accessToken" FROM "Integration" WHERE id = ${row!.id}`;
    expect(raw[0].accessToken).toMatch(/^v1:/);
    expect(calls.some((c) => c.startsWith("POST") && c.includes("/subscribed_apps"))).toBe(true);
  });

  it("refuses replay, expiry and another tenant; a login with no WABA or no phone connects nothing", async () => {
    session.current = { userId, activeBusinessId: businessId };
    const s = await state();
    await hit({ code: "abc", state: s });
    expect(location(await hit({ code: "abc", state: s })).searchParams.get("connect_error")).toBe("state");
    const s3 = await state({ expiresIn: "1s" });
    await new Promise((r) => setTimeout(r, 1500));
    expect(location(await hit({ code: "abc", state: s3 })).searchParams.get("connect_error")).toBe("expired");
    expect(location(await hit({ code: "abc", state: await state({ businessId: otherBusinessId }) })).searchParams.get("connect_error")).toBe("tenant");
    const savedWabas = provider.wabas;
    provider.wabas = [];
    expect(location(await hit({ code: "abc", state: await state() })).searchParams.get("connect_error")).toBe("no_waba");
    provider.wabas = savedWabas;
    const savedPhones = provider.phones;
    provider.phones = [];
    expect(location(await hit({ code: "abc", state: await state() })).searchParams.get("connect_error")).toBe("no_phone");
    provider.phones = savedPhones;
  });

  it("a phone number already feeding another workspace is refused", async () => {
    session.current = { userId, activeBusinessId: businessId };
    await prisma.integration.deleteMany({ where: { businessId, provider: "WHATSAPP" } });
    await prisma.integration.create({ data: { businessId: otherBusinessId, provider: "WHATSAPP", status: "CONNECTED", externalId: "pn_100", accessToken: "t" } });
    expect(location(await hit({ code: "abc", state: await state() })).searchParams.get("connect_error")).toBe("in_use");
    await prisma.integration.deleteMany({ where: { businessId: otherBusinessId } });
  });
});
