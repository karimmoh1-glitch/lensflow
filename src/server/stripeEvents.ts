import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments";
import { sendOnChannel } from "@/lib/messaging";
import { track } from "@/lib/analytics";
import { trackReferralMilestone } from "@/server/referral";
import { reportFailure } from "@/lib/observe";
import { planKeyFromPrice, subscriptionPeriodEnd, invoiceSubscriptionId } from "@/lib/subscriptionBilling";
import type { BillingStatus } from "@prisma/client";

/**
 * What a verified Stripe event does to the database. Pure of transport so it can be
 * driven by the webhook route and by tests with signed fixtures.
 *
 * Only Daythread's own subscriptions live here (mode: subscription, customer.subscription.*,
 * invoice.*, charge.dispute.*): they write Business.planTier / billingStatus, the only
 * source of entitlements. Daythread never charges a business's clients; a payment-mode
 * checkout is ignored.
 *
 * Every write is scoped by the businessId the event carries AND, for subscriptions, by the
 * customer the business owns — a webhook can never mutate another tenant. And a
 * subscription is never applied from the event's snapshot: Stripe does not guarantee
 * order, and a retried delivery can be hours old, so the subscription is re-read from
 * Stripe first and the current state is what gets written.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<{ handled: boolean; note?: string }> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.metadata?.businessId && typeof session.customer === "string") {
        await prisma.business.updateMany({ where: { id: session.metadata.businessId, OR: [{ stripeCustomerId: null }, { stripeCustomerId: session.customer }] }, data: { stripeCustomerId: session.customer } });
        // Sync right away rather than waiting for customer.subscription.created (ordering is not guaranteed).
        if (typeof session.subscription === "string" && stripe) {
          const sub = await stripe.subscriptions.retrieve(session.subscription).catch(() => null);
          if (sub) await syncSubscription(sub, { fresh: true });
        }
        await track("checkout_completed", { businessId: session.metadata.businessId, properties: { planKey: session.metadata?.planTier } });
        return { handled: true };
      }
      return { handled: false, note: "session ignored" };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await syncSubscription(event.data.object as Stripe.Subscription);
      return { handled: true };
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscription(subscription);
      if (subscription.metadata?.businessId) await track("subscription_canceled", { businessId: subscription.metadata.businessId });
      return { handled: true };
    }
    case "invoice.paid": {
      // A retry after a failure succeeded, or a renewal went through: re-read the subscription.
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId && stripe) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(subscription, { fresh: true });
        await clearPaymentFailedNotice(subscription);
      }
      return { handled: true };
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId && stripe) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(subscription, { fresh: true });
        await notifyPaymentFailed(subscription);
      }
      return { handled: true };
    }
    case "charge.dispute.created": {
      // A chargeback on a subscription invoice: Stripe does not cancel the subscription, so
      // the plan stays paid-for on paper while the money is gone. Access is withdrawn until
      // the dispute is resolved, and the founder is told.
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
      const business = chargeId && stripe ? await businessForCharge(chargeId) : null;
      if (!business) return { handled: false, note: "dispute for an unknown customer" };
      await prisma.business.updateMany({ where: { id: business.id }, data: { billingStatus: "UNPAID" } });
      await reportFailure("billing", "Subscription payment disputed; paid access withdrawn until it is resolved", { businessId: business.id, provider: "stripe", meta: { dispute: dispute.id, amount: dispute.amount, reason: dispute.reason } });
      await track("subscription_disputed", { businessId: business.id, properties: { reason: dispute.reason } });
      return { handled: true };
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
      const business = customerId ? await prisma.business.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } }) : null;
      if (!business) return { handled: false, note: "refund for an unknown customer" };
      // A refund is an operator's decision (goodwill, a mistaken charge); it does not change
      // access by itself, but it is never silent.
      await reportFailure("billing", "A subscription charge was refunded", { businessId: business.id, provider: "stripe", level: "warn", meta: { charge: charge.id, amountRefunded: charge.amount_refunded } });
      return { handled: true };
    }
    default:
      return { handled: false, note: `unhandled ${event.type}` };
  }
}

const STRIPE_STATUS_MAP: Record<string, BillingStatus> = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  incomplete: "INCOMPLETE",
  incomplete_expired: "INCOMPLETE_EXPIRED",
  unpaid: "UNPAID",
  paused: "CANCELED",
};

/** Statuses under which a subscription still governs the plan. */
const LIVE_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

/**
 * The subscription as Stripe holds it now. Events are snapshots that can arrive out of order
 * and are replayed on retry; a retried "active" from before a cancellation used to resurrect
 * a cancelled plan indefinitely. A read that fails throws, so the delivery is marked failed
 * and retried, rather than applying a snapshot that may be stale.
 */
async function freshSubscription(id: string): Promise<Stripe.Subscription> {
  if (!stripe) throw new Error("Stripe is not configured");
  return stripe.subscriptions.retrieve(id);
}

async function businessForCharge(chargeId: string): Promise<{ id: string } | null> {
  if (!stripe) return null;
  const charge = await stripe.charges.retrieve(chargeId);
  const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  if (!customerId) return null;
  return prisma.business.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } });
}

export async function syncSubscription(snapshot: Stripe.Subscription, opts: { fresh?: boolean } = {}): Promise<void> {
  const subscription = opts.fresh ? snapshot : await freshSubscription(snapshot.id);
  const businessId = subscription.metadata?.businessId;
  if (!businessId) {
    await reportFailure("billing", "Subscription carries no businessId metadata; nothing granted", { provider: "stripe", meta: { subscription: subscription.id } });
    return;
  }
  // The tier is what the subscription is actually priced at (a switch made inside the Stripe
  // portal changes the price, not our metadata). Metadata is the fallback; anything that
  // isn't one of our prices grants nothing.
  const price = subscription.items?.data?.[0]?.price ?? null;
  const fromPrice = planKeyFromPrice(price);
  const fromMeta = subscription.metadata?.planTier === "PRO" || subscription.metadata?.planTier === "BUSINESS" ? subscription.metadata.planTier : null;
  const planTier = fromPrice ?? fromMeta;
  if (!planTier) {
    await reportFailure("billing", "Subscription is not priced on a Daythread plan; nothing granted", { businessId, provider: "stripe", meta: { subscription: subscription.id } });
    return;
  }
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { stripeCustomerId: true, stripeSubscriptionId: true, planTier: true, billingStatus: true, trialUsedAt: true } });
  if (!business) return;
  // Tenant guard: the subscription's customer must be this business's customer (or the
  // business has none yet and is being linked by its own checkout).
  if (business.stripeCustomerId && business.stripeCustomerId !== customerId) {
    await reportFailure("billing", "Subscription customer does not match the business it names; refused", { businessId, provider: "stripe", meta: { subscription: subscription.id } });
    return;
  }
  // Another subscription already governs this business. While that one is still live, an
  // event about a different one — an abandoned first checkout expiring a day later, a
  // cancellation of the old one after an upgrade replaced it — must not clobber it. Once
  // the stored one is gone, the new one takes over.
  if (business.stripeSubscriptionId && business.stripeSubscriptionId !== subscription.id) {
    const current = stripe ? await stripe.subscriptions.retrieve(business.stripeSubscriptionId).catch(() => null) : null;
    if (current && LIVE_STATUSES.has(current.status)) {
      await reportFailure("billing", "Ignored an event for a subscription that is not the business's live one", { businessId, provider: "stripe", level: "warn", meta: { subscription: subscription.id, live: business.stripeSubscriptionId } });
      return;
    }
  }
  const billingStatus = STRIPE_STATUS_MAP[subscription.status] ?? "CANCELED";
  // Funnel signal: the first time this workspace becomes a paying subscriber.
  const entitledNow = billingStatus === "ACTIVE" || billingStatus === "TRIALING";
  const entitledBefore = business.planTier !== "FREE" && (business.billingStatus === "ACTIVE" || business.billingStatus === "TRIALING" || business.billingStatus === "PAST_DUE");
  if (entitledNow && !entitledBefore) {
    await track("subscription_started", { businessId, properties: { planKey: planTier, trial: subscription.status === "trialing" } });
    await trackReferralMilestone(businessId, "referral_converted", { planKey: planTier });
  }
  if (subscription.status === "trialing" && !business.trialUsedAt) await track("trial_started", { businessId, properties: { planKey: planTier } });
  await prisma.business.updateMany({
    where: { id: businessId },
    data: {
      stripeCustomerId: business.stripeCustomerId ?? customerId,
      stripeSubscriptionId: subscription.id,
      planTier,
      billingStatus,
      currentPeriodEnd: subscriptionPeriodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEndsAt: subscription.status === "trialing" && subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      ...(subscription.trial_end ? { trialUsedAt: new Date() } : {}),
    },
  });
}

const FAILED_TITLE = "Your Daythread payment didn't go through";

async function notifyPaymentFailed(subscription: Stripe.Subscription) {
  const businessId = subscription.metadata?.businessId;
  if (!businessId) return;
  const owner = await prisma.orgMembership.findFirst({ where: { businessId, role: "OWNER", status: "ACTIVE" }, include: { user: true, business: true } });
  if (!owner) return;
  const billingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`;
  // In-app first (always works), then email (when a provider is configured).
  const existing = await prisma.notification.findFirst({ where: { businessId, title: FAILED_TITLE, read: false } });
  // One notice per failure, however many times Stripe (or the retry run) delivers the event.
  if (existing) return;
  await prisma.notification.create({ data: { businessId, title: FAILED_TITLE, body: "We couldn't charge the card on file. Stripe will retry over the next few days; update your card from Billing to keep your plan." } });
  await sendOnChannel({
    channel: "EMAIL",
    to: owner.user.email,
    subject: FAILED_TITLE,
    body: `Hi ${owner.user.name}, we weren't able to charge the card on file for ${owner.business.name}'s Daythread subscription. We'll automatically retry over the next few days — no action needed yet, but you can update your card anytime here: ${billingUrl}`,
  }).catch((err) => console.error("[stripe] payment-failed email send failed", err));
}

async function clearPaymentFailedNotice(subscription: Stripe.Subscription) {
  const businessId = subscription.metadata?.businessId;
  if (!businessId) return;
  await prisma.notification.updateMany({ where: { businessId, title: FAILED_TITLE, read: false }, data: { read: true } });
}
