import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export const stripeIsLive = Boolean(stripe);
/** Shared client for Daythread's own subscription billing (src/lib/subscriptionBilling.ts,
 * the Stripe webhook route) — same account, same key, kept as one instance. */
export { stripe };

/**
 * Creates a card/Apple Pay checkout via Stripe when configured. Without a key, returns
 * a demo checkout URL that lands on our own simulated-payment page — never claims a
 * real charge happened.
 */
export async function createCardCheckout(params: {
  amountCents: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  customerEmail?: string | null;
}): Promise<{ url: string; demo: boolean }> {
  if (stripe) {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Let Stripe offer whatever the customer's device supports (card, Apple Pay, Link…).
      ...(params.customerEmail ? { customer_email: params.customerEmail } : {}),
      client_reference_id: params.metadata.paymentId,
      payment_intent_data: { metadata: params.metadata },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: params.description },
            unit_amount: params.amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    });
    return { url: session.url!, demo: false };
  }

  const qs = new URLSearchParams({
    amount: String(params.amountCents),
    description: params.description,
    success: params.successUrl,
    ...params.metadata,
  });
  return { url: `/pay/demo?${qs.toString()}`, demo: true };
}
