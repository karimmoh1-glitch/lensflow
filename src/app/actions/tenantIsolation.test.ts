import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Server actions call revalidatePath/redirect, which depend on Next's request-scoped
// render context — unavailable when calling the action function directly outside Next's
// runtime. Mocked as no-ops so the actual authorization logic (the thing under test) runs
// for real against a real database.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { confirmPayment, completeCardCheckout } from "./bookings";

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

/**
 * Regression test for a real payment-integrity bypass fixed in this codebase:
 * completeCardCheckout used to accept any authenticated org member (including CLIENT and
 * PARTNER roles), letting a client mark their own or another client's invoice paid with
 * no proof of payment. It's now staff-only, or the specific CLIENT who owns that exact
 * payment — every other combination must be rejected.
 */
describe("tenant isolation — completeCardCheckout", () => {
  let businessId: string;
  let clientOneUserId: string;
  let clientTwoUserId: string;
  let partnerUserId: string;
  let clientOneSession: { userId: string; activeBusinessId: string };
  let clientTwoSession: { userId: string; activeBusinessId: string };
  let partnerSession: { userId: string; activeBusinessId: string };
  let clientOnePaymentId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword("test-password-not-real");
    const business = await prisma.business.create({ data: { name: "Card Checkout Fixture", handle: `test-fixture-cc-${Date.now()}` } });
    businessId = business.id;

    const userOne = await prisma.user.create({ data: { name: "Client One", email: `client-one-${Date.now()}@test.invalid`, passwordHash } });
    const userTwo = await prisma.user.create({ data: { name: "Client Two", email: `client-two-${Date.now()}@test.invalid`, passwordHash } });
    const partner = await prisma.user.create({ data: { name: "Partner", email: `partner-${Date.now()}@test.invalid`, passwordHash } });
    clientOneUserId = userOne.id;
    clientTwoUserId = userTwo.id;
    partnerUserId = partner.id;

    const clientOne = await prisma.client.create({ data: { businessId, userId: userOne.id, name: "Client One", email: "client-one@test.invalid" } });
    await prisma.client.create({ data: { businessId, userId: userTwo.id, name: "Client Two", email: "client-two@test.invalid" } });

    await prisma.orgMembership.create({ data: { userId: userOne.id, businessId, role: "CLIENT" } });
    await prisma.orgMembership.create({ data: { userId: userTwo.id, businessId, role: "CLIENT" } });
    await prisma.orgMembership.create({ data: { userId: partner.id, businessId, role: "PARTNER" } });

    clientOneSession = { userId: userOne.id, activeBusinessId: businessId };
    clientTwoSession = { userId: userTwo.id, activeBusinessId: businessId };
    partnerSession = { userId: partner.id, activeBusinessId: businessId };

    const payment = await prisma.payment.create({
      data: { businessId, clientId: clientOne.id, method: "CARD", purpose: "DEPOSIT", amountCents: 5000, status: "AWAITING_CONFIRMATION" },
    });
    clientOnePaymentId = payment.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [clientOneUserId, clientTwoUserId, partnerUserId] } } });
    await prisma.business.delete({ where: { id: businessId } });
  });

  it("a client cannot mark a different client's payment as paid", async () => {
    await expect(completeCardCheckout(clientOnePaymentId, clientTwoSession)).rejects.toThrow();
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: clientOnePaymentId } });
    expect(payment.status).toBe("AWAITING_CONFIRMATION");
  });

  it("a PARTNER cannot mark any payment as paid", async () => {
    await expect(completeCardCheckout(clientOnePaymentId, partnerSession)).rejects.toThrow();
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: clientOnePaymentId } });
    expect(payment.status).toBe("AWAITING_CONFIRMATION");
  });

  it("the owning client CAN mark their own payment as paid", async () => {
    await completeCardCheckout(clientOnePaymentId, clientOneSession);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: clientOnePaymentId } });
    expect(payment.status).toBe("PAID");
  });
});
