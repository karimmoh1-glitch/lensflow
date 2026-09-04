import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/payments";
import { prisma } from "@/lib/db";
import { sendOnChannel } from "@/lib/messaging";
import { track } from "@/lib/analytics";
import { markPaymentPaidAndAdvanceBooking } from "@/server/payments";
import type { BillingStatus } from "@prisma/client";

/**
 * Stripe's webhook for Daythread's own subscription billing (a business paying us) —
 * distinct from any future webhook covering a business's own end-client card payments.
 * Configure this URL (…/api/webhooks/stripe) in the Stripe Dashboard subscribed to at
 * least: checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed, customer.subscription.created/updated/deleted,
 * invoice.payment_failed. Copy the signing secret into STRIPE_WEBHOOK_SECRET.
 *
 * Handles both sides of money: Daythread's own subscriptions (mode: subscription) and a
 * business's client deposits/balances paid by card (mode: payment, metadata.paymentId).
 *
 * Signature-verified (stripe.webhooks.constructEvent) and idempotent — every event id is
 * recorded in WebhookEvent before processing; a redelivery hits the unique constraint and
 * no-ops. The database, not the browser, is the source of truth for entitlements: nothing
 * in the checkout success page itself grants access.
 */
export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe billing isn't configured on this deployment." }, { status: 501 });
  }

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    console.error("[webhook:stripe] invalid signature", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await prisma.webhookEvent.create({ data: { provider: "stripe", eventId: event.id } });
  } catch {
    // Unique constraint hit — already processed this exact event. Ack and stop.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.metadata?.businessId && typeof session.customer === "string") {
          await prisma.business.updateMany({
            where: { id: session.metadata.businessId },
            data: { stripeCustomerId: session.customer },
          });
          await track("checkout_completed", { businessId: session.metadata.businessId, properties: { planKey: session.metadata?.planTier } });
        }
        // A business's own client paying a deposit or balance by card: the checkout carried
        // the payment id in metadata, so this is what marks it PAID (never the redirect).
        if (session.mode === "payment" && session.payment_status === "paid" && session.metadata?.paymentId && session.metadata?.businessId) {
          const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
          await markPaymentPaidAndAdvanceBooking(session.metadata.paymentId, session.metadata.businessId, { stripePaymentIntentId: intentId });
        }
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment" && session.metadata?.paymentId && session.metadata?.businessId) {
          const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
          await markPaymentPaidAndAdvanceBooking(session.metadata.paymentId, session.metadata.businessId, { stripePaymentIntentId: intentId });
        }
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment" && session.metadata?.paymentId && session.metadata?.businessId) {
          await prisma.payment.updateMany({ where: { id: session.metadata.paymentId, businessId: session.metadata.businessId, status: "AWAITING_CONFIRMATION" }, data: { status: "FAILED" } });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscription(subscription);
        if (subscription.metadata?.businessId) await track("subscription_canceled", { businessId: subscription.metadata.businessId });
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscription(subscription);
          await notifyPaymentFailed(subscription);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`[webhook:stripe] failed processing ${event.type}`, err);
    // Release the idempotency claim so Stripe's retry is processed rather than swallowed
    // as a duplicate.
    await prisma.webhookEvent.deleteMany({ where: { provider: "stripe", eventId: event.id } }).catch(() => {});
    return NextResponse.json({ error: "Internal error processing event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

const STRIPE_STATUS_MAP: Record<string, BillingStatus> = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  incomplete: "INCOMPLETE",
  incomplete_expired: "INCOMPLETE_EXPIRED",
  unpaid: "UNPAID",
};

/**
 * Stripe retries a failed card automatically (Smart Retries) and the business keeps full
 * access in the meantime (see PAST_DUE in ENTITLED_STATUSES, billing.ts) — that's correct,
 * a single declined card shouldn't lock anyone out. But silently keeping access with no
 * notification means the only way an owner finds out is by proactively opening /billing,
 * which risks the subscription lapsing to CANCELED with the owner never having known why.
 */
async function notifyPaymentFailed(subscription: Stripe.Subscription) {
  const businessId = subscription.metadata?.businessId;
  if (!businessId) return;

  const owner = await prisma.orgMembership.findFirst({
    where: { businessId, role: "OWNER", status: "ACTIVE" },
    include: { user: true, business: true },
  });
  if (!owner) return;

  const billingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`;
  await sendOnChannel({
    channel: "EMAIL",
    to: owner.user.email,
    subject: "Your Daythread payment didn't go through",
    body: `Hi ${owner.user.name}, we weren't able to charge the card on file for ${owner.business.name}'s Daythread subscription. We'll automatically retry over the next few days — no action needed yet, but you can update your card anytime here: ${billingUrl}`,
  }).catch((err) => console.error("[webhook:stripe] payment-failed email send failed", err));
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const businessId = subscription.metadata?.businessId;
  if (!businessId) {
    console.error("[webhook:stripe] subscription missing businessId metadata", subscription.id);
    return;
  }
  const planTier = subscription.metadata?.planTier === "BUSINESS" ? "BUSINESS" : "PRO";
  const billingStatus = STRIPE_STATUS_MAP[subscription.status] ?? "CANCELED";

  await prisma.business.updateMany({
    where: { id: businessId },
    data: {
      stripeSubscriptionId: subscription.id,
      planTier,
      billingStatus,
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}
