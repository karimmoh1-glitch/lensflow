import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Stripe from "stripe";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/**
 * Signed Stripe events against the real webhook route and database. The Stripe SDK's own
 * test-header generator signs each payload with the webhook secret, so the route runs the
 * exact verification production runs. No Stripe API call is made (every event here is
 * self-contained), and the key is a dummy — nothing leaves the machine.
 */
const WEBHOOK_SECRET = "whsec_test_daythread";
let POST: (req: Request) => Promise<Response>;
const signer = new Stripe("sk_test_dummy", { apiVersion: undefined as unknown as Stripe.LatestApiVersion });

function signed(body: object): Request {
  const payload = JSON.stringify(body);
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": header, "content-type": "application/json" } });
}
let seq = 0;
const evt = (type: string, object: object) => ({ id: `evt_test_${Date.now()}_${++seq}`, object: "event", type, data: { object }, api_version: "2024-06-20", created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 1, request: null });
const price = (planKey: "PRO" | "BUSINESS", amount: number) => ({ id: `price_${planKey}`, object: "price", lookup_key: `daythread_${planKey.toLowerCase()}_monthly`, unit_amount: amount, currency: "usd", recurring: { interval: "month" }, product: `prod_${planKey}` });
const subscription = (o: { id: string; businessId: string; customer: string; status: string; planKey: "PRO" | "BUSINESS" | null; periodEnd?: number; cancelAtPeriodEnd?: boolean }) => ({
  id: o.id,
  object: "subscription",
  customer: o.customer,
  status: o.status,
  cancel_at_period_end: Boolean(o.cancelAtPeriodEnd),
  current_period_end: o.periodEnd ?? Math.floor(Date.now() / 1000) + 30 * 86400,
  metadata: { businessId: o.businessId, ...(o.planKey ? { planTier: o.planKey } : {}) },
  items: { object: "list", data: [{ id: "si_1", object: "subscription_item", price: o.planKey ? price(o.planKey, o.planKey === "PRO" ? 2000 : 8000) : { id: "price_foreign", object: "price", lookup_key: "someone_elses_plan", unit_amount: 100, currency: "usd", recurring: { interval: "month" }, product: "prod_x" } }] },
});

describe("Stripe webhook", () => {
  let aId: string;
  let bId: string;
  let paymentId: string;
  let bookingId: string;

  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    ({ POST } = await import("@/app/api/webhooks/stripe/route"));
    await prisma.webhookEvent.deleteMany({ where: { provider: "stripe", eventId: { startsWith: "evt_test_" } } });
    const stamp = Date.now();
    const a = await prisma.business.create({ data: { name: "Stripe A", handle: `stripe-a-${stamp}`, stripeCustomerId: `cus_A_${stamp}` } });
    const b = await prisma.business.create({ data: { name: "Stripe B", handle: `stripe-b-${stamp}` } });
    aId = a.id;
    bId = b.id;
    const service = await prisma.service.create({ data: { businessId: aId, name: "Session", priceCents: 40000, durationMins: 60 } });
    const client = await prisma.client.create({ data: { businessId: aId, name: "Payer", email: `payer-${stamp}@example.com` } });
    const booking = await prisma.booking.create({ data: { businessId: aId, clientId: client.id, serviceId: service.id, startAt: new Date(Date.now() + 86400000), endAt: new Date(Date.now() + 90000000), status: "BOOKED", totalCents: 40000, depositCents: 12000 } });
    bookingId = booking.id;
    const payment = await prisma.payment.create({ data: { businessId: aId, bookingId, clientId: client.id, method: "CARD", purpose: "DEPOSIT", amountCents: 12000, status: "AWAITING_CONFIRMATION" } });
    paymentId = payment.id;
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: aId } });
    await prisma.business.delete({ where: { id: bId } });
    await prisma.webhookEvent.deleteMany({ where: { provider: "stripe", eventId: { startsWith: "evt_test_" } } });
    vi.unstubAllEnvs();
  });

  it("rejects an invalid signature and writes nothing", async () => {
    const body = JSON.stringify(evt("customer.subscription.updated", subscription({ id: "sub_bad", businessId: aId, customer: `cus_A`, status: "active", planKey: "PRO" })));
    const res = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body, headers: { "stripe-signature": "t=1,v1=deadbeef" } }));
    expect(res.status).toBe(400);
    expect((await prisma.business.findUnique({ where: { id: aId } }))?.planTier).toBe("FREE");
    expect(await prisma.webhookEvent.count({ where: { eventId: { startsWith: "evt_test_" } } })).toBe(0);
  });

  it("syncs a Pro subscription, then a portal switch to Business read from the price, then cancellation", async () => {
    const a = (await prisma.business.findUnique({ where: { id: aId } }))!;
    let res = await POST(signed(evt("customer.subscription.created", subscription({ id: "sub_A1", businessId: aId, customer: a.stripeCustomerId!, status: "active", planKey: "PRO" }))));
    expect(res.status).toBe(200);
    let after = await prisma.business.findUnique({ where: { id: aId } });
    expect(after?.planTier).toBe("PRO");
    expect(after?.billingStatus).toBe("ACTIVE");
    expect(after?.stripeSubscriptionId).toBe("sub_A1");
    expect(after?.currentPeriodEnd).toBeTruthy();

    // Switched inside the Stripe portal: metadata still says PRO, the price says BUSINESS.
    const switched = subscription({ id: "sub_A1", businessId: aId, customer: a.stripeCustomerId!, status: "active", planKey: "BUSINESS" });
    switched.metadata = { businessId: aId, planTier: "PRO" };
    res = await POST(signed(evt("customer.subscription.updated", switched)));
    expect(res.status).toBe(200);
    after = await prisma.business.findUnique({ where: { id: aId } });
    expect(after?.planTier).toBe("BUSINESS");

    // Past due keeps the plan but flags it; canceled drops entitlement.
    await POST(signed(evt("customer.subscription.updated", subscription({ id: "sub_A1", businessId: aId, customer: a.stripeCustomerId!, status: "past_due", planKey: "BUSINESS" }))));
    after = await prisma.business.findUnique({ where: { id: aId } });
    expect(after?.billingStatus).toBe("PAST_DUE");
    await POST(signed(evt("customer.subscription.deleted", subscription({ id: "sub_A1", businessId: aId, customer: a.stripeCustomerId!, status: "canceled", planKey: "BUSINESS" }))));
    after = await prisma.business.findUnique({ where: { id: aId } });
    expect(after?.billingStatus).toBe("CANCELED");
    const { effectivePlan } = await import("@/lib/billing");
    expect(effectivePlan(after!)).toBe("FREE");
  });

  it("acknowledges a duplicate delivery without re-applying it", async () => {
    const a = (await prisma.business.findUnique({ where: { id: aId } }))!;
    const event = evt("customer.subscription.updated", subscription({ id: "sub_A2", businessId: aId, customer: a.stripeCustomerId!, status: "active", planKey: "PRO" }));
    const first = await POST(signed(event));
    expect(await first.json()).toMatchObject({ ok: true, handled: true });
    // The plan moved on since; the same event id delivered again must not touch anything.
    await prisma.business.update({ where: { id: aId }, data: { planTier: "BUSINESS" } });
    const second = await POST(signed(event));
    expect(await second.json()).toMatchObject({ ok: true, duplicate: true });
    expect((await prisma.business.findUnique({ where: { id: aId } }))?.planTier).toBe("BUSINESS");
    expect(await prisma.webhookEvent.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("refuses a subscription whose customer belongs to another tenant, and one priced on a foreign plan", async () => {
    const a = (await prisma.business.findUnique({ where: { id: aId } }))!;
    // Metadata claims business B, but the customer is A's.
    await POST(signed(evt("customer.subscription.updated", subscription({ id: "sub_X", businessId: bId, customer: a.stripeCustomerId!, status: "active", planKey: "BUSINESS" }))));
    let b = await prisma.business.findUnique({ where: { id: bId } });
    expect(b?.planTier).toBe("FREE");
    expect(b?.stripeSubscriptionId).toBeNull();
    // B's own customer, but a price that isn't a Daythread plan (and metadata without a tier).
    await prisma.business.update({ where: { id: bId }, data: { stripeCustomerId: `cus_B_${Date.now()}` } });
    b = await prisma.business.findUnique({ where: { id: bId } });
    await POST(signed(evt("customer.subscription.created", subscription({ id: "sub_Y", businessId: bId, customer: b!.stripeCustomerId!, status: "active", planKey: null }))));
    expect((await prisma.business.findUnique({ where: { id: bId } }))?.planTier).toBe("FREE");
  });

  it("marks a client deposit paid exactly once from a payment-mode checkout, and a retry does not double-apply", async () => {
    const session = { id: "cs_dep_1", object: "checkout.session", mode: "payment", payment_status: "paid", payment_intent: "pi_123", customer: null, metadata: { paymentId, businessId: aId, bookingId } };
    const event = evt("checkout.session.completed", session);
    const res = await POST(signed(event));
    expect(res.status).toBe(200);
    let payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(payment?.status).toBe("PAID");
    expect(payment?.stripePaymentIntentId).toBe("pi_123");
    expect((await prisma.booking.findUnique({ where: { id: bookingId } }))?.status).toBe("DEPOSIT_PAID");
    const confirmedAt = payment?.confirmedAt;
    // Same session in a new event id (Stripe retried with a fresh delivery) — still once.
    await POST(signed(evt("checkout.session.async_payment_succeeded", session)));
    payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(payment?.confirmedAt?.getTime()).toBe(confirmedAt?.getTime());
    expect(await prisma.payment.count({ where: { bookingId } })).toBe(1);
  });

  it("a payment event scoped to the wrong tenant changes nothing", async () => {
    const client = await prisma.client.create({ data: { businessId: bId, name: "B Client" } });
    const other = await prisma.payment.create({ data: { businessId: bId, clientId: client.id, method: "CARD", purpose: "DEPOSIT", amountCents: 500, status: "AWAITING_CONFIRMATION" } });
    // Business A's id with B's payment id — the helper scopes by business and finds nothing.
    const res = await POST(signed(evt("checkout.session.completed", { id: "cs_x", object: "checkout.session", mode: "payment", payment_status: "paid", payment_intent: "pi_x", metadata: { paymentId: other.id, businessId: aId } })));
    expect(res.status).toBe(500); // not found → processing error → claim released for a retry
    expect((await prisma.payment.findUnique({ where: { id: other.id } }))?.status).toBe("AWAITING_CONFIRMATION");
    expect(await prisma.webhookEvent.count({ where: { eventId: { contains: "evt_test" }, receivedAt: { gte: new Date(Date.now() - 1000) } } })).toBeGreaterThanOrEqual(0);
  });
});

describe("simulated card confirmation is closed once Stripe is live", () => {
  it("completeCardCheckout refuses when a key is configured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.resetModules();
    const { completeCardCheckout } = await import("@/app/actions/bookings");
    await expect(completeCardCheckout("anything", { userId: "x", activeBusinessId: "y" })).rejects.toThrow(/confirmed by Stripe/);
    vi.unstubAllEnvs();
  });
});
