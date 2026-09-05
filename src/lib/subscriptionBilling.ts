import Stripe from "stripe";
import { stripe } from "@/lib/payments";
import { prisma } from "@/lib/db";
import { PLANS, type PlanKey } from "@/lib/billing";
import type { Business } from "@prisma/client";

export const subscriptionBillingIsLive = Boolean(stripe);

/** Stable lookup keys: the one link between the plan table and Stripe's prices. */
export const LOOKUP_KEYS: Record<Extract<PlanKey, "PRO" | "BUSINESS">, string> = {
  PRO: "daythread_pro_monthly",
  BUSINESS: "daythread_business_monthly",
};

/** The plan a Stripe price belongs to, read from its lookup key. Null for anything that
 * isn't one of ours — such a subscription must never grant a tier. */
export function planKeyFromPrice(price: Stripe.Price | string | null | undefined): Extract<PlanKey, "PRO" | "BUSINESS"> | null {
  const key = typeof price === "string" ? null : price?.lookup_key;
  if (key === LOOKUP_KEYS.PRO) return "PRO";
  if (key === LOOKUP_KEYS.BUSINESS) return "BUSINESS";
  return null;
}

/** Period end across Stripe API versions: on the subscription before 2025-03, on the items after. */
export function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const s = subscription as Stripe.Subscription & { current_period_end?: number };
  const fromSub = s.current_period_end;
  const fromItem = (subscription.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
  const end = fromSub ?? fromItem;
  return end ? new Date(end * 1000) : null;
}

/** The subscription an invoice belongs to, across API versions. */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const i = invoice as Stripe.Invoice & { subscription?: string | { id: string } | null; parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null };
  const direct = i.subscription;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object") return direct.id;
  const nested = i.parent?.subscription_details?.subscription;
  if (typeof nested === "string") return nested;
  if (nested && typeof nested === "object") return nested.id;
  return null;
}

async function getOrCreateStripeCustomer(business: Business, email: string): Promise<string> {
  if (business.stripeCustomerId) return business.stripeCustomerId;
  if (!stripe) throw new Error("Stripe is not configured on this deployment.");

  // Never create a second customer for the same business: re-check Stripe by metadata first
  // (a previous attempt may have created one before our database write).
  const found = await stripe.customers.search({ query: `metadata['businessId']:'${business.id}'`, limit: 1 }).catch(() => null);
  const customer = found?.data[0] ?? (await stripe.customers.create({ email, name: business.name, metadata: { businessId: business.id } }));
  await prisma.business.update({ where: { id: business.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/**
 * Real Stripe Prices, get-or-created on first use and addressed by a stable `lookup_key`
 * rather than an ID we'd have to store somewhere ourselves — Stripe is the durable store.
 * Idempotent: an existing active price with the right amount is reused; a stale amount is
 * replaced by a new price that takes over the lookup key (the old one is archived so it
 * can never be sold again); a concurrent create is absorbed by one more lookup.
 */
const priceCache = new Map<PlanKey, string>();

export async function getOrCreatePriceId(planKey: Extract<PlanKey, "PRO" | "BUSINESS">): Promise<string> {
  const cached = priceCache.get(planKey);
  if (cached) return cached;
  if (!stripe) throw new Error("Stripe is not configured on this deployment.");

  const plan = PLANS[planKey];
  const lookupKey = LOOKUP_KEYS[planKey];

  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const current = existing.data[0];
  if (current && current.unit_amount === plan.priceCents && current.currency === "usd" && current.recurring?.interval === "month") {
    priceCache.set(planKey, current.id);
    return current.id;
  }

  try {
    const productId = current
      ? typeof current.product === "string"
        ? current.product
        : current.product.id
      : (await stripe.products.create({ name: `Daythread ${plan.name}`, metadata: { planKey } })).id;
    const price = await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: plan.priceCents,
      recurring: { interval: "month" },
      lookup_key: lookupKey,
      transfer_lookup_key: true,
      metadata: { planKey },
    });
    // The stale price loses its lookup key above; archive it so nothing can pick it up.
    if (current) await stripe.prices.update(current.id, { active: false }).catch(() => {});
    priceCache.set(planKey, price.id);
    return price.id;
  } catch (err) {
    const retry = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    if (retry.data[0]) {
      priceCache.set(planKey, retry.data[0].id);
      return retry.data[0].id;
    }
    throw err;
  }
}

/**
 * Starts a subscription checkout for one of Daythread's own paid plans. The plan is carried
 * on the subscription's metadata and is also recoverable from the price's lookup key, so
 * the webhook can sync state however the subscription later changes.
 */
export async function createSubscriptionCheckout(params: {
  business: Business;
  ownerEmail: string;
  planKey: Extract<PlanKey, "PRO" | "BUSINESS">;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  if (!stripe) throw new Error("Stripe is not configured on this deployment.");

  const [customerId, priceId] = await Promise.all([getOrCreateStripeCustomer(params.business, params.ownerEmail), getOrCreatePriceId(params.planKey)]);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: params.business.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { businessId: params.business.id, planTier: params.planKey } },
    metadata: { businessId: params.business.id, planTier: params.planKey },
    allow_promotion_codes: true,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { url: session.url };
}

/**
 * Changes plan for a business that already has a live Stripe subscription — updates the
 * existing subscription's price in place (prorated) rather than creating a second one.
 * The webhook's customer.subscription.updated handler syncs the new plan onto the row.
 */
export async function changeSubscriptionPlan(params: { business: Business; planKey: Extract<PlanKey, "PRO" | "BUSINESS"> }): Promise<void> {
  if (!stripe) throw new Error("Stripe is not configured on this deployment.");
  if (!params.business.stripeSubscriptionId) throw new Error("No active subscription to change — start a checkout instead.");

  const [subscription, priceId] = await Promise.all([stripe.subscriptions.retrieve(params.business.stripeSubscriptionId), getOrCreatePriceId(params.planKey)]);
  // Ownership: the subscription must belong to this business's customer.
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  if (params.business.stripeCustomerId && customerId !== params.business.stripeCustomerId) throw new Error("Subscription does not belong to this business.");
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) throw new Error("Subscription has no line item to update.");

  await stripe.subscriptions.update(params.business.stripeSubscriptionId, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: "create_prorations",
    cancel_at_period_end: false,
    metadata: { businessId: params.business.id, planTier: params.planKey },
  });
}

/**
 * The Stripe-hosted portal for managing a subscription: card changes, invoices, plan
 * switches between our two prices, cancellation at period end. A portal needs a saved
 * configuration; on a fresh account we create one so the first click works.
 */
let portalConfigurationId: string | null = null;

async function ensurePortalConfiguration(): Promise<string | undefined> {
  if (!stripe) return undefined;
  if (portalConfigurationId) return portalConfigurationId;
  const existing = await stripe.billingPortal.configurations.list({ limit: 10 });
  const ours = existing.data.find((c) => c.metadata?.app === "daythread" && c.active);
  if (ours) {
    portalConfigurationId = ours.id;
    return ours.id;
  }
  const [pro, business] = await Promise.all([getOrCreatePriceId("PRO"), getOrCreatePriceId("BUSINESS")]);
  const [proPrice, businessPrice] = await Promise.all([stripe.prices.retrieve(pro), stripe.prices.retrieve(business)]);
  const productOf = (p: Stripe.Price) => (typeof p.product === "string" ? p.product : p.product.id);
  const created = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Daythread — manage your subscription" },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "missing_features", "switched_service", "unused", "other"] } },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: [
          { product: productOf(proPrice), prices: [pro] },
          { product: productOf(businessPrice), prices: [business] },
        ],
      },
    },
    metadata: { app: "daythread" },
  });
  portalConfigurationId = created.id;
  return created.id;
}

export async function createBillingPortalSession(params: { business: Business; returnUrl: string; flow?: "payment_method" }): Promise<{ url: string }> {
  if (!stripe) throw new Error("Stripe is not configured on this deployment.");
  if (!params.business.stripeCustomerId) throw new Error("No billing account yet — subscribe to a plan first.");

  const configuration = await ensurePortalConfiguration().catch((err) => {
    console.error("[billing] portal configuration failed; using the account default", err);
    return undefined;
  });
  const session = await stripe.billingPortal.sessions.create({
    customer: params.business.stripeCustomerId,
    return_url: params.returnUrl,
    ...(configuration ? { configuration } : {}),
    ...(params.flow === "payment_method" ? { flow_data: { type: "payment_method_update" as const } } : {}),
  });
  return { url: session.url };
}

/**
 * What the billing page shows, read from Stripe when a customer exists: the card on file,
 * the amount and date of the next charge, and recent invoices. Fail-soft: any Stripe error
 * leaves the page working with database state only.
 */
export type BillingSnapshot = {
  paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  nextInvoice: { amountCents: number; at: Date | null } | null;
  invoices: Array<{ id: string; number: string | null; amountCents: number; status: string; at: Date; url: string | null }>;
};

export async function getBillingSnapshot(business: Business): Promise<BillingSnapshot | null> {
  if (!stripe || !business.stripeCustomerId) return null;
  try {
    const [customer, invoices, upcoming] = await Promise.all([
      stripe.customers.retrieve(business.stripeCustomerId, { expand: ["invoice_settings.default_payment_method"] }),
      stripe.invoices.list({ customer: business.stripeCustomerId, limit: 6 }),
      business.stripeSubscriptionId && business.billingStatus && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(business.billingStatus) && !business.cancelAtPeriodEnd
        ? (stripe.invoices as unknown as { retrieveUpcoming?: (p: { customer: string }) => Promise<Stripe.Invoice> }).retrieveUpcoming?.({ customer: business.stripeCustomerId }).catch(() => null) ?? Promise.resolve(null)
        : Promise.resolve(null),
    ]);
    let paymentMethod: BillingSnapshot["paymentMethod"] = null;
    if (!("deleted" in customer)) {
      const pm = customer.invoice_settings?.default_payment_method;
      const card = pm && typeof pm !== "string" ? pm.card : null;
      if (card) paymentMethod = { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year };
      else {
        const list = await stripe.paymentMethods.list({ customer: business.stripeCustomerId, type: "card", limit: 1 });
        const c = list.data[0]?.card;
        if (c) paymentMethod = { brand: c.brand, last4: c.last4, expMonth: c.exp_month, expYear: c.exp_year };
      }
    }
    return {
      paymentMethod,
      nextInvoice: upcoming ? { amountCents: upcoming.amount_due, at: business.currentPeriodEnd ?? (upcoming.period_end ? new Date(upcoming.period_end * 1000) : null) } : null,
      invoices: invoices.data.map((i) => ({ id: i.id, number: i.number, amountCents: i.amount_paid || i.amount_due, status: i.status ?? "open", at: new Date(i.created * 1000), url: i.hosted_invoice_url ?? null })),
    };
  } catch (err) {
    console.error("[billing] snapshot failed", err instanceof Error ? err.message : err);
    return null;
  }
}

/** For the owner setup page: is the key valid, and which mode is it? Never returns the key. */
export async function probeStripe(): Promise<{ ok: boolean; mode: "live" | "test" | null; accountLabel: string | null; error: string | null }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!stripe || !key) return { ok: false, mode: null, accountLabel: null, error: "missing" };
  const mode = key.startsWith("sk_live_") ? "live" : key.startsWith("sk_test_") ? "test" : null;
  try {
    const account = await stripe.accounts.retrieve();
    return { ok: true, mode, accountLabel: account.settings?.dashboard?.display_name ?? account.business_profile?.name ?? account.id, error: null };
  } catch (err) {
    return { ok: false, mode, accountLabel: null, error: err instanceof Error ? err.message : "invalid" };
  }
}
