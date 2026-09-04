import { stripe } from "@/lib/payments";
import { prisma } from "@/lib/db";
import { PLANS, type PlanKey } from "@/lib/billing";
import type { Business } from "@prisma/client";

export const subscriptionBillingIsLive = Boolean(stripe);

async function getOrCreateStripeCustomer(business: Business, email: string): Promise<string> {
  if (business.stripeCustomerId) return business.stripeCustomerId;
  if (!stripe) throw new Error("Stripe is not configured on this deployment.");

  const customer = await stripe.customers.create({
    email,
    name: business.name,
    metadata: { businessId: business.id },
  });
  await prisma.business.update({ where: { id: business.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/**
 * Real Stripe Prices, get-or-created on first use and addressed by a stable `lookup_key`
 * rather than an ID we'd have to store somewhere ourselves — Stripe is the durable store.
 * Needed (not just inline price_data) because changing an existing subscription's price
 * requires a real Price/Product id; Stripe's subscription-update endpoint won't inline-
 * create a product the way Checkout's line items can.
 */
const priceCache = new Map<PlanKey, string>();

async function getOrCreatePriceId(planKey: Extract<PlanKey, "PRO" | "BUSINESS">): Promise<string> {
  const cached = priceCache.get(planKey);
  if (cached) return cached;
  if (!stripe) throw new Error("Stripe is not configured on this deployment.");

  const plan = PLANS[planKey];
  const lookupKey = `daythread_${planKey.toLowerCase()}_monthly`;

  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const current = existing.data[0];
  if (current && current.unit_amount === plan.priceCents && current.currency === "usd" && current.recurring?.interval === "month") {
    priceCache.set(planKey, current.id);
    return current.id;
  }

  try {
    // Either no price yet, or the plan table changed price: create the new one and move the
    // lookup key onto it so the next call finds it. Existing subscribers stay on their price
    // until they change plans — Stripe never reprices a live subscription by itself.
    const productId = current ? (typeof current.product === "string" ? current.product : current.product.id) : (await stripe.products.create({ name: `Daythread ${plan.name}`, metadata: { planKey } })).id;
    const price = await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: plan.priceCents,
      recurring: { interval: "month" },
      lookup_key: lookupKey,
      transfer_lookup_key: true,
    });
    priceCache.set(planKey, price.id);
    return price.id;
  } catch (err) {
    // Lookup keys are unique among active prices — a concurrent request may have created
    // it a moment ago. One more lookup before giving up for real.
    const retry = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    if (retry.data[0]) {
      priceCache.set(planKey, retry.data[0].id);
      return retry.data[0].id;
    }
    throw err;
  }
}

/**
 * Starts a subscription checkout for one of Daythread's own paid plans. The plan is also
 * carried on the subscription's own metadata so the webhook handler can sync state without
 * reverse-mapping a price ID back to a plan.
 */
export async function createSubscriptionCheckout(params: {
  business: Business;
  ownerEmail: string;
  planKey: Extract<PlanKey, "PRO" | "BUSINESS">;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  if (!stripe) throw new Error("Stripe is not configured on this deployment.");

  const [customerId, priceId] = await Promise.all([
    getOrCreateStripeCustomer(params.business, params.ownerEmail),
    getOrCreatePriceId(params.planKey),
  ]);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      metadata: { businessId: params.business.id, planTier: params.planKey },
    },
    metadata: { businessId: params.business.id, planTier: params.planKey },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { url: session.url };
}

/**
 * Changes plan for a business that already has an active Stripe subscription — updates
 * the existing subscription's price in place (with proration) rather than creating a
 * second subscription, which is what a fresh Checkout Session would otherwise do. The
 * webhook's customer.subscription.updated handler is what actually syncs the new plan
 * onto the Business row; this just tells Stripe what changed.
 */
export async function changeSubscriptionPlan(params: {
  business: Business;
  planKey: Extract<PlanKey, "PRO" | "BUSINESS">;
}): Promise<void> {
  if (!stripe) throw new Error("Stripe is not configured on this deployment.");
  if (!params.business.stripeSubscriptionId) throw new Error("No active subscription to change — start a checkout instead.");

  const [subscription, priceId] = await Promise.all([
    stripe.subscriptions.retrieve(params.business.stripeSubscriptionId),
    getOrCreatePriceId(params.planKey),
  ]);
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) throw new Error("Subscription has no line item to update.");

  await stripe.subscriptions.update(params.business.stripeSubscriptionId, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: "create_prorations",
    metadata: { businessId: params.business.id, planTier: params.planKey },
  });
}

/** The Stripe-hosted portal for managing/canceling a subscription and viewing invoices —
 * only available once a business has a Stripe customer (i.e. has started a checkout at
 * least once). */
export async function createBillingPortalSession(params: {
  business: Business;
  returnUrl: string;
}): Promise<{ url: string }> {
  if (!stripe) throw new Error("Stripe is not configured on this deployment.");
  if (!params.business.stripeCustomerId) throw new Error("No billing account yet — subscribe to a plan first.");

  const session = await stripe.billingPortal.sessions.create({
    customer: params.business.stripeCustomerId,
    return_url: params.returnUrl,
  });
  return { url: session.url };
}
