import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Wallet readiness: every checkout Daythread creates must leave the payment-method choice to
 * Stripe (dynamic payment methods), so Apple Pay / Google Pay appear wherever the device and
 * the Stripe account allow and the card form is the fallback. A `payment_method_types`
 * restriction here would silently remove wallets from Checkout.
 */
const created: unknown[] = [];
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: async (params: unknown) => { created.push(params); return { url: "https://checkout.stripe.com/c/pay/cs_test_123", id: "cs_test_123" }; } } };
  },
}));

describe("card checkout", () => {
  beforeEach(() => {
    created.length = 0;
    vi.resetModules();
  });

  it("with Stripe configured: hosted Checkout, dynamic payment methods (wallets allowed), metadata for the webhook, never a demo URL", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    const { createCardCheckout, stripeIsLive } = await import("./payments");
    expect(stripeIsLive).toBe(true);
    const r = await createCardCheckout({ amountCents: 15000, description: "Deposit", successUrl: "https://daythread.org/ok", cancelUrl: "https://daythread.org/no", metadata: { paymentId: "p1", businessId: "b1", bookingId: "k1" }, customerEmail: "c@example.com" });
    expect(r.demo).toBe(false);
    expect(r.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const params = created[0] as Record<string, unknown>;
    expect(params.mode).toBe("payment");
    expect(params).not.toHaveProperty("payment_method_types");
    expect((params.payment_intent_data as { metadata: Record<string, string> }).metadata).toMatchObject({ paymentId: "p1", businessId: "b1" });
    expect(params.client_reference_id).toBe("p1");
  });

  it("without Stripe: an explicitly simulated checkout, flagged as demo, so nothing can be shown as paid", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { createCardCheckout, stripeIsLive } = await import("./payments");
    expect(stripeIsLive).toBe(false);
    const r = await createCardCheckout({ amountCents: 15000, description: "Deposit", successUrl: "/ok", cancelUrl: "/no", metadata: { paymentId: "p1", businessId: "b1" } });
    expect(r.demo).toBe(true);
    expect(r.url.startsWith("/pay/demo")).toBe(true);
    expect(created).toHaveLength(0);
  });
});
