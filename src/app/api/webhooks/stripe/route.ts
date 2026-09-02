import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/payments";
import { prisma } from "@/lib/db";
import type { BillingStatus } from "@prisma/client";

/**
 * Stripe's webhook for Daythread's own subscription billing (a business paying us) —
 * distinct from any future webhook covering a business's own end-client card payments.
 * Configure this URL (…/api/webhooks/stripe) in the Stripe Dashboard subscribed to at
 * least: checkout.session.completed, customer.subscription.created/updated/deleted,
 * invoice.payment_failed. Copy the signing secret into STRIPE_WEBHOOK_SECRET.
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
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscription(subscription);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`[webhook:stripe] failed processing ${event.type}`, err);
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
