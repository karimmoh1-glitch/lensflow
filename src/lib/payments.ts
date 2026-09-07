import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export const stripeIsLive = Boolean(stripe);
/** Shared client for Daythread's own subscription billing (src/lib/subscriptionBilling.ts,
 * the Stripe webhook route) — same account, same key, kept as one instance. */
export { stripe };
