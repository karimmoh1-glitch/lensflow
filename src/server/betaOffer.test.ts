import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { addDays, subDays } from "date-fns";
import { prisma } from "@/lib/db";

const current = vi.hoisted(() => ({ session: null as null | { userId: string; activeBusinessId: string } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 20}` }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@/lib/auth", async (importOriginal) => { const mod = await importOriginal<typeof import("@/lib/auth")>(); return { ...mod, getSession: async () => current.session }; });

import { effectivePlan, nextPlan, planPurchasable, BETA_PRO_DAYS } from "@/lib/billing";
import { claimBetaPro, betaGrantForNewWorkspace } from "@/server/betaOffer";
import { claimBetaProOffer, startUpgradeCheckout } from "@/app/actions/billing";
import { integrationUsage, activateIntegration } from "@/server/integrationQuota";

/**
 * The beta offer: Pro free for a month for everyone, claimable, and not abusable. And
 * Business, which cannot be bought at the moment by any route.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

describe("beta Pro offer", () => {
  const businesses: string[] = [];
  const users: string[] = [];

  async function workspace(opts: { planTier?: "FREE" | "PRO" | "BUSINESS"; billingStatus?: "ACTIVE" | null; compedPlan?: "BUSINESS" | null; ownerId?: string; role?: "OWNER" | "ADMIN" | "PHOTOGRAPHER" | "PARTNER" | "CLIENT" } = {}) {
    const s = stamp();
    const biz = await prisma.business.create({ data: { name: `Beta ${s}`, handle: `beta-${s}`, planTier: opts.planTier ?? "FREE", billingStatus: opts.billingStatus ?? null, compedPlan: opts.compedPlan ?? null } });
    businesses.push(biz.id);
    let userId = opts.ownerId;
    if (!userId) {
      const u = await prisma.user.create({ data: { name: "Owner", email: `beta-${s}@example.test`, passwordHash: "x" } });
      users.push(u.id);
      userId = u.id;
    }
    await prisma.orgMembership.create({ data: { userId, businessId: biz.id, role: opts.role ?? "OWNER" } });
    return { businessId: biz.id, userId, session: { userId, activeBusinessId: biz.id } };
  }

  beforeAll(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://daythread.org");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://daythread.org");
  });
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businesses } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it("the beta month lifts Free to Pro, ends on time, and never lowers a higher plan", () => {
    const live = addDays(new Date(), 3);
    const gone = subDays(new Date(), 1);
    expect(effectivePlan({ planTier: "FREE", billingStatus: null, betaProEndsAt: live })).toBe("PRO");
    expect(effectivePlan({ planTier: "FREE", billingStatus: null, betaProEndsAt: gone })).toBe("FREE");
    expect(effectivePlan({ planTier: "FREE", billingStatus: null, betaProEndsAt: null })).toBe("FREE");
    expect(effectivePlan({ planTier: "BUSINESS", billingStatus: "ACTIVE", betaProEndsAt: live })).toBe("BUSINESS");
    expect(effectivePlan({ planTier: "FREE", billingStatus: null, compedPlan: "BUSINESS", betaProEndsAt: live })).toBe("BUSINESS");
    // A lapsed paid subscription during the beta month is still Pro, not nothing.
    expect(effectivePlan({ planTier: "BUSINESS", billingStatus: "CANCELED", betaProEndsAt: live })).toBe("PRO");
  });

  it("a brand-new workspace is granted exactly the fixed month; closing the offer stops new grants", () => {
    const now = new Date("2026-09-01T12:00:00Z");
    expect(betaGrantForNewWorkspace(now)).toEqual({ betaProEndsAt: addDays(now, BETA_PRO_DAYS), betaProClaimedAt: now });
    vi.stubEnv("BETA_PRO_OFFER", "off");
    expect(betaGrantForNewWorkspace(now)).toEqual({});
  });

  it("signing up through the mobile API creates a workspace that is on Pro immediately", async () => {
    const { POST } = await import("@/app/api/mobile/auth/signup/route");
    const email = `beta-signup-${stamp()}@example.test`;
    const res = await POST(new Request("http://localhost/api/mobile/auth/signup", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 20}` }, body: JSON.stringify({ name: "New Person", email, password: "a-long-password-1" }) }));
    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { orgMemberships: { include: { business: true } } } });
    users.push(user.id);
    const biz = user.orgMemberships[0].business;
    businesses.push(biz.id);
    expect(biz.betaProClaimedAt).toBeTruthy();
    expect(biz.betaProEndsAt!.getTime() - biz.betaProClaimedAt!.getTime()).toBe(BETA_PRO_DAYS * 86400_000);
    expect(effectivePlan(biz)).toBe("PRO");
    // Pro limits are enforced server-side from the stored grant, not from anything the app sends.
    expect((await integrationUsage(biz.id)).limit).toBe(Infinity);
    for (const provider of ["EMAIL", "GOOGLE_CALENDAR", "APPLE_CALENDAR"] as const) {
      expect((await activateIntegration({ businessId: biz.id, provider, create: { externalId: `${provider}-x` }, update: {} })).ok).toBe(true);
    }
  });

  it("an existing Free workspace can claim it once; a second claim is refused and the end date does not move", async () => {
    const w = await workspace();
    const first = await claimBetaProOffer(w.session);
    expect(first.ok).toBe(true);
    const row = await prisma.business.findUniqueOrThrow({ where: { id: w.businessId } });
    expect(effectivePlan(row)).toBe("PRO");
    const again = await claimBetaProOffer(w.session);
    expect(again).toEqual({ ok: false, error: expect.stringMatching(/already had/i) });
    const after = await prisma.business.findUniqueOrThrow({ where: { id: w.businessId } });
    expect(after.betaProEndsAt?.getTime()).toBe(row.betaProEndsAt?.getTime());
    expect(await prisma.auditLog.count({ where: { businessId: w.businessId, action: "billing.beta_pro_claimed" } })).toBe(1);
  });

  it("twenty simultaneous claims grant once", async () => {
    const w = await workspace();
    const results = await Promise.all(Array.from({ length: 20 }, () => claimBetaPro(w.businessId, w.userId)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { businessId: w.businessId, action: "billing.beta_pro_claimed" } })).toBe(1);
  });

  it("one person gets one beta month: a second workspace they own cannot claim another", async () => {
    const w1 = await workspace();
    expect((await claimBetaPro(w1.businessId, w1.userId)).ok).toBe(true);
    const w2 = await workspace({ ownerId: w1.userId });
    expect(await claimBetaPro(w2.businessId, w1.userId)).toMatchObject({ ok: false, reason: "claimed_elsewhere" });
    expect((await prisma.business.findUniqueOrThrow({ where: { id: w2.businessId } })).betaProEndsAt).toBeNull();
  });

  it("a workspace already on Pro or better keeps its claim for later", async () => {
    const paid = await workspace({ planTier: "PRO", billingStatus: "ACTIVE" });
    expect(await claimBetaPro(paid.businessId, paid.userId)).toMatchObject({ ok: false, reason: "already_pro" });
    const comped = await workspace({ compedPlan: "BUSINESS" });
    expect(await claimBetaPro(comped.businessId, comped.userId)).toMatchObject({ ok: false, reason: "already_pro" });
    expect((await prisma.business.findUniqueOrThrow({ where: { id: paid.businessId } })).betaProClaimedAt).toBeNull();
  });

  it("only an owner or admin can claim, only for their own workspace, and never when the offer is closed", async () => {
    const owner = await workspace();
    for (const role of ["PHOTOGRAPHER", "PARTNER", "CLIENT"] as const) {
      const u = await prisma.user.create({ data: { name: role, email: `beta-${role.toLowerCase()}-${stamp()}@example.test`, passwordHash: "x" } });
      users.push(u.id);
      await prisma.orgMembership.create({ data: { userId: u.id, businessId: owner.businessId, role } });
      expect((await claimBetaProOffer({ userId: u.id, activeBusinessId: owner.businessId })).ok).toBe(false);
    }
    expect((await claimBetaProOffer(null)).ok).toBe(false);
    // A session naming a workspace the user is not a member of never reaches it: the
    // membership decides, so the claim can only ever land on the user's own workspace.
    const other = await workspace();
    await claimBetaProOffer({ userId: other.userId, activeBusinessId: owner.businessId });
    expect((await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } })).betaProClaimedAt).toBeNull();
    expect((await prisma.business.findUniqueOrThrow({ where: { id: other.businessId } })).betaProClaimedAt).not.toBeNull();

    vi.stubEnv("BETA_PRO_OFFER", "off");
    expect(await claimBetaProOffer(owner.session)).toEqual({ ok: false, error: expect.stringMatching(/ended/i) });
    expect((await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } })).betaProClaimedAt).toBeNull();
  });

  it("an admin can claim for the workspace", async () => {
    const owner = await workspace();
    const admin = await prisma.user.create({ data: { name: "Admin", email: `beta-admin-${stamp()}@example.test`, passwordHash: "x" } });
    users.push(admin.id);
    await prisma.orgMembership.create({ data: { userId: admin.id, businessId: owner.businessId, role: "ADMIN" } });
    expect((await claimBetaProOffer({ userId: admin.id, activeBusinessId: owner.businessId })).ok).toBe(true);
  });

  it("Business cannot be bought by any route while it is unavailable, and is never offered as the next step", async () => {
    expect(planPurchasable("BUSINESS")).toBe(false);
    expect(planPurchasable("PRO")).toBe(true);
    expect(nextPlan("PRO")).toBeNull();
    expect(nextPlan("FREE")).toBe("PRO");
    const w = await workspace({ planTier: "PRO", billingStatus: "ACTIVE" });
    expect(await startUpgradeCheckout("BUSINESS", "month", w.session)).toEqual({ error: "Business is temporarily unavailable." });
    // The refusal comes before the session is even consulted.
    expect(await startUpgradeCheckout("BUSINESS", "year", null)).toEqual({ error: "Business is temporarily unavailable." });
    expect((await integrationUsage(w.businessId)).nextPlan).toBeNull();
  });
});
