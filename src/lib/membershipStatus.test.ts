import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

const cookie = { value: "" };
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.88" }),
  cookies: async () => ({
    get: (name: string) => (name === "lf_session" && cookie.value ? { value: cookie.value } : undefined),
    set: (name: string, value: string) => { if (name === "lf_session") cookie.value = value; },
    delete: () => { cookie.value = ""; },
  }),
}));

import { createSessionToken, setActiveBusiness, requireBusiness } from "@/lib/auth";

/**
 * Suspending somebody has to mean something. Their membership row stays - the owner may
 * put them back - so every gate has to read the status, not the row's existence.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

describe("a suspended member", () => {
  const ids: string[] = [];
  let businessId: string;
  let otherBusinessId: string;
  let userId: string;

  beforeAll(async () => {
    const s = stamp();
    businessId = (await prisma.business.create({ data: { name: "Suspend Co", handle: `suspend-${s}` } })).id;
    otherBusinessId = (await prisma.business.create({ data: { name: "Other Co", handle: `other-${s}` } })).id;
    ids.push(businessId, otherBusinessId);
    const user = await prisma.user.create({ data: { name: "Pat", email: `pat-${s}@example.test`, passwordHash: "x" } });
    userId = user.id;
    await prisma.orgMembership.create({ data: { userId, businessId, role: "PHOTOGRAPHER" } });
    await prisma.orgMembership.create({ data: { userId, businessId: otherBusinessId, role: "OWNER" } });
    cookie.value = await createSessionToken({ userId, activeBusinessId: otherBusinessId });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  it("can point their session at a workspace while the membership is active", async () => {
    await expect(setActiveBusiness(businessId)).resolves.toBeUndefined();
    expect((await requireBusiness())?.business.id).toBe(businessId);
  });

  it("cannot point their session at a workspace they were suspended from", async () => {
    await prisma.orgMembership.updateMany({ where: { userId, businessId }, data: { status: "SUSPENDED" } });
    cookie.value = await createSessionToken({ userId, activeBusinessId: otherBusinessId });
    await expect(setActiveBusiness(businessId)).rejects.toThrow();
    // And the cookie was not quietly changed on the way out.
    expect((await requireBusiness())?.business.id).toBe(otherBusinessId);
  });

  it("loses the workspace even holding a session that already names it", async () => {
    cookie.value = await createSessionToken({ userId, activeBusinessId: businessId });
    // Two memberships, one of them suspended: there is no unambiguous workspace left, so
    // nothing is resolved rather than falling through to the other one.
    const ctx = await requireBusiness();
    expect(ctx?.business.id).not.toBe(businessId);
  });

  it("is restored by making the membership active again", async () => {
    await prisma.orgMembership.updateMany({ where: { userId, businessId }, data: { status: "ACTIVE" } });
    cookie.value = await createSessionToken({ userId, activeBusinessId: businessId });
    expect((await requireBusiness())?.business.id).toBe(businessId);
  });
});
