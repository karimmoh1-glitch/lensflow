import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Server actions call revalidatePath/redirect, which depend on Next's request-scoped
// render context — unavailable when calling the action function directly outside Next's
// runtime. Mocked as no-ops so the actual authorization logic (the thing under test) runs
// for real against a real database.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { confirmPayment } from "./bookings";

/**
 * Real IDOR regression test: Business B's authenticated owner must never be able to act
 * on Business A's payment, even knowing its id. confirmPayment resolves the acting
 * business from the session (never a client-supplied businessId), then scopes its lookup
 * with `WHERE id = ? AND businessId = ?` — if that scoping is ever dropped, this test
 * starts failing instead of silently allowing cross-tenant access.
 */
describe("tenant isolation — confirmPayment", () => {
  let businessAId: string;
  let businessBId: string;
  let ownerBSession: { userId: string; activeBusinessId: string };
  let paymentAId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword("test-password-not-real");

    const businessA = await prisma.business.create({ data: { name: "Tenant A", handle: `test-fixture-a-${Date.now()}` } });
    const businessB = await prisma.business.create({ data: { name: "Tenant B", handle: `test-fixture-b-${Date.now()}` } });
    businessAId = businessA.id;
    businessBId = businessB.id;

    const ownerB = await prisma.user.create({ data: { name: "Owner B", email: `owner-b-${Date.now()}@test.invalid`, passwordHash } });
    await prisma.orgMembership.create({ data: { userId: ownerB.id, businessId: businessB.id, role: "OWNER" } });
    ownerBSession = { userId: ownerB.id, activeBusinessId: businessB.id };

    const clientA = await prisma.client.create({ data: { businessId: businessA.id, name: "Client A", email: "client-a@test.invalid" } });
    const paymentA = await prisma.payment.create({
      data: {
        businessId: businessA.id,
        clientId: clientA.id,
        method: "ZELLE",
        purpose: "DEPOSIT",
        amountCents: 10000,
        status: "AWAITING_CONFIRMATION",
      },
    });
    paymentAId = paymentA.id;
  });

  afterAll(async () => {
    // Users aren't scoped under Business's cascade delete, so clean them up explicitly.
    await prisma.user.deleteMany({ where: { id: ownerBSession.userId } });
    await prisma.business.delete({ where: { id: businessAId } });
    await prisma.business.delete({ where: { id: businessBId } });
  });

  it("Business B's owner cannot confirm Business A's payment", async () => {
    await expect(confirmPayment(paymentAId, ownerBSession)).rejects.toThrow();

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentAId } });
    expect(payment.status).toBe("AWAITING_CONFIRMATION");
    expect(payment.confirmedAt).toBeNull();
  });

  it("rejects an unauthenticated call the same way", async () => {
    await expect(confirmPayment(paymentAId, null)).rejects.toThrow();
  });
});
