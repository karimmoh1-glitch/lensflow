import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/payments";
import { prisma } from "@/lib/db";
import { handleStripeEvent } from "@/server/stripeEvents";

/**
 * Stripe → Daythread. Configure this URL (…/api/webhooks/stripe) in the Stripe Dashboard
 * subscribed to: checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed, customer.subscription.created / updated / deleted,
 * invoice.paid, invoice.payment_failed. Copy the signing secret into STRIPE_WEBHOOK_SECRET.
 *
 * Signature-verified, then idempotent: the event id is claimed in WebhookEvent before any
 * work; a redelivery of a processed event is acknowledged and ignored; a failure releases
 * the claim so Stripe's retry is processed. The database — never the browser redirect — is
 * the source of truth for plans and payments. Nothing about the payload is logged beyond
 * the event type and id.
 */
export const dynamic = "force-dynamic";

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
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await prisma.webhookEvent.create({ data: { provider: "stripe", eventId: event.id } });
  } catch {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const result = await handleStripeEvent(event);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(`[webhook:stripe] failed processing ${event.type} ${event.id}`, err instanceof Error ? err.message : err);
    await prisma.webhookEvent.deleteMany({ where: { provider: "stripe", eventId: event.id } }).catch(() => {});
    return NextResponse.json({ error: "Internal error processing event" }, { status: 500 });
  }
}
