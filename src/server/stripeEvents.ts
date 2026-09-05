import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments";
import { sendOnChannel } from "@/lib/messaging";
import { track } from "@/lib/analytics";
import { markPaymentPaidAndAdvanceBooking } from "@/server/payments";
import { planKeyFromPrice, subscriptionPeriodEnd, invoiceSubscriptionId } from "@/lib/subscriptionBilling";
import type { BillingStatus } from "@prisma/client";

/**
 * What a verified Stripe event does to the database. Pure of transport so it can be
 * driven by the webhook route and by tests with signed fixtures.
 *
 * Two kinds of money, kept apart:
 *   - Daythread's own subscriptions (mode: subscription, customer.subscription.*, invoice.*)
 *     write Business.planTier / billingStatus — the only source of entitlements.
 *   - A business's client paying a deposit or balance by card (mode: payment, metadata
 *     paymentId + businessId) marks that Payment PAID and advances its booking.
 *
 * Every write is scoped by the businessId the event carries AND, for subscriptions, by the
 * customer the business owns — a webhook can never mutate another tenant.
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
          if (sub) await syncSubscription(sub);
        }
        await track("checkout_completed", { businessId: session.metadata.businessId, properties: { planKey: session.metadata?.planTier } });
        return { handled: true };
      }
      if (session.mode === "payment" && session.payment_status === "paid") return payClientPayment(session);
      return { handled: false, note: "session ignored" };
    }
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment") return payClientPayment(session);
      return { handled: false };
    }
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment" && session.metadata?.paymentId && session.metadata?.businessId) {
        await prisma.payment.updateMany({ where: { id: session.metadata.paymentId, businessId: session.metadata.businessId, status: "AWAITING_CONFIRMATION" }, data: { status: "FAILED" } });
        return { handled: true };
      }
      return { handled: false };
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
        await syncSubscription(subscription);
        await clearPaymentFailedNotice(subscription);
      }
      return { handled: true };
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId && stripe) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(subscription);
        await notifyPaymentFailed(subscription);
      }
      return { handled: true };
    }
    default:
      return { handled: false, note: `unhandled ${event.type}` };
  }
}

async function payClientPayment(session: Stripe.Checkout.Session): Promise<{ handled: boolean; note?: string }> {
  const paymentId = session.metadata?.paymentId;
  const businessId = session.metadata?.businessId;
  if (!paymentId || !businessId) return { handled: false, note: "payment session without metadata" };
  const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  // Scoped by business inside; a PAID payment is left alone, so a retry cannot double-apply.
  await markPaymentPaidAndAdvanceBooking(paymentId, businessId, { stripePaymentIntentId: intentId });
  return { handled: true };
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

export async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const businessId = subscription.metadata?.businessId;
  if (!businessId) {
    console.error("[stripe] subscription missing businessId metadata", subscription.id);
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
    console.error("[stripe] subscription is not priced on a Daythread plan; not syncing", subscription.id);
    return;
  }
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { stripeCustomerId: true, stripeSubscriptionId: true } });
  if (!business) return;
  // Tenant guard: the subscription's customer must be this business's customer (or the
  // business has none yet and is being linked by its own checkout).
  if (business.stripeCustomerId && business.stripeCustomerId !== customerId) {
    console.error("[stripe] subscription customer does not match business; refusing", subscription.id);
    return;
  }
  // A stale event about a superseded subscription must not clobber the live one.
  if (business.stripeSubscriptionId && business.stripeSubscriptionId !== subscription.id && subscription.status === "canceled") {
    return;
  }
  const billingStatus = STRIPE_STATUS_MAP[subscription.status] ?? "CANCELED";
  await prisma.business.updateMany({
    where: { id: businessId },
    data: {
      stripeCustomerId: business.stripeCustomerId ?? customerId,
      stripeSubscriptionId: subscription.id,
      planTier,
      billingStatus,
      currentPeriodEnd: subscriptionPeriodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
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
  if (!existing) await prisma.notification.create({ data: { businessId, title: FAILED_TITLE, body: "We couldn't charge the card on file. Stripe will retry over the next few days; update your card from Billing to keep your plan." } });
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
