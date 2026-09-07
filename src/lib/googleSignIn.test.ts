import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const cookieStore = { set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: cookieStore.set, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/db";
import { completeGoogleSignIn } from "./googleSignIn";

/**
 * "Continue with Google": a verified Google email becomes one account with its own
 * workspace, the same email signs into that account afterwards (never a second one), an
 * existing password account is linked by email, and an unverified email is refused.
 * Google itself is mocked at the network boundary.
 */
const google = { email: "", verified: true, name: "Sam Lee" };
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "at_test", expires_in: 3600, scope: "openid email profile", token_type: "Bearer" }), { status: 200 });
  if (url.includes("userinfo")) return new Response(JSON.stringify({ sub: "g-1", email: google.email, email_verified: google.verified, name: google.name }), { status: 200 });
  if (url.includes("/revoke")) return new Response("{}", { status: 200 });
  throw new Error(`unexpected fetch ${url}`);
});

describe("Google sign-in", () => {
  const stamp = Date.now();
  const emails: string[] = [];
  beforeAll(() => {
    vi.stubGlobal("fetch", fetchMock);
    process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-client";
    process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "test-secret";
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, include: { orgMemberships: true } });
    await prisma.business.deleteMany({ where: { id: { in: users.flatMap((u) => u.orgMemberships.map((m) => m.businessId)) } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });

  it("creates one account and workspace for a new verified email, then signs the same email into it", async () => {
    google.email = `gsi-new-${stamp}@gsi-fixture.invalid`;
    emails.push(google.email);
    const first = await completeGoogleSignIn("code-1");
    expect(first).toMatchObject({ ok: true, redirectTo: "/onboarding" });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: google.email }, include: { orgMemberships: { include: { business: true } } } });
    expect(user.name).toBe("Sam Lee");
    expect(user.orgMemberships).toHaveLength(1);
    expect(user.orgMemberships[0].role).toBe("OWNER");
    expect(user.orgMemberships[0].business.name).toBe("Sam's inbox");
    expect(cookieStore.set).toHaveBeenCalled();

    // Five sign-ins at once for a brand-new address still make exactly one account.
    google.email = `gsi-burst-${stamp}@gsi-fixture.invalid`;
    emails.push(google.email);
    await Promise.all(Array.from({ length: 5 }).map(() => completeGoogleSignIn("code-n")));
    expect(await prisma.user.count({ where: { email: google.email } })).toBe(1);
    expect(await prisma.business.count({ where: { orgMemberships: { some: { user: { email: google.email } } } } })).toBe(1);

    const again = await completeGoogleSignIn("code-2");
    expect(again.ok).toBe(true);
    expect(await prisma.user.count({ where: { email: google.email } })).toBe(1);
  });

  it("links an existing password account by verified email instead of creating a second one", async () => {
    google.email = `gsi-existing-${stamp}@gsi-fixture.invalid`;
    emails.push(google.email);
    const business = await prisma.business.create({ data: { name: "Existing", handle: `gsi-existing-${stamp}`, onboardingComplete: true } });
    const user = await prisma.user.create({ data: { name: "Existing Person", email: google.email, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: user.id, businessId: business.id, role: "OWNER" } });
    const r = await completeGoogleSignIn("code-3");
    expect(r).toMatchObject({ ok: true, redirectTo: "/dashboard" });
    expect(await prisma.user.count({ where: { email: google.email } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: google.email } })).name).toBe("Existing Person");
  });

  it("refuses an unverified email and creates nothing", async () => {
    google.email = `gsi-unverified-${stamp}@gsi-fixture.invalid`;
    google.verified = false;
    const r = await completeGoogleSignIn("code-4");
    expect(r).toEqual({ ok: false, reason: "unverified" });
    expect(await prisma.user.count({ where: { email: google.email } })).toBe(0);
    google.verified = true;
  });
});
