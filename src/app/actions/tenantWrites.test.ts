import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSessionToken, verifySessionToken } from "@/lib/auth";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "198.51.100.11" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { assignPartner } from "@/app/actions/bookings";

/**
 * A tenant-safe write that reports success having changed nothing is worse than one that
 * fails: the page then shows a change that was never saved. updateMany cannot tell the two
 * apart on its own, so the action has to check.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

describe("writes that cross a workspace", () => {
  const ids: string[] = [];
  let a: { businessId: string; session: NonNullable<Awaited<ReturnType<typeof verifySessionToken>>> };
  let theirBookingId: string;

  beforeAll(async () => {
    const mk = async (name: string) => {
      const s = stamp();
      const biz = await prisma.business.create({ data: { name, handle: `${name.toLowerCase()}-${s}` } });
      const user = await prisma.user.create({ data: { name: `${name} Owner`, email: `${name.toLowerCase()}-${s}@example.test`, passwordHash: "x" } });
      await prisma.orgMembership.create({ data: { userId: user.id, businessId: biz.id, role: "OWNER" } });
      ids.push(biz.id);
      const token = await createSessionToken({ userId: user.id, activeBusinessId: biz.id });
      return { businessId: biz.id, session: (await verifySessionToken(token))! };
    };
    a = await mk("Alpha");
    const b = await mk("Bravo");
    const client = await prisma.client.create({ data: { businessId: b.businessId, name: "Theirs" } });
    const service = await prisma.service.create({ data: { businessId: b.businessId, name: "Session", priceCents: 100 } });
    theirBookingId = (await prisma.booking.create({ data: { businessId: b.businessId, clientId: client.id, serviceId: service.id, startAt: new Date(), endAt: new Date(Date.now() + 3600_000), status: "CONFIRMED", totalCents: 100 } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  it("assigning another workspace's booking is refused out loud, not silently ignored", async () => {
    await expect(assignPartner(theirBookingId, null, a.session)).rejects.toThrow(/no longer exists/i);
    const untouched = await prisma.booking.findUniqueOrThrow({ where: { id: theirBookingId } });
    expect(untouched.assignedMembershipId).toBeNull();
  });
});
