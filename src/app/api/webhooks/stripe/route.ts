import { NextResponse } from "next/server";
import { readBoundedText } from "@/lib/http";
import type Stripe from "stripe";
import { stripe } from "@/lib/payments";
import { handleStripeEvent } from "@/server/stripeEvents";
import { runWebhook } from "@/server/webhookInbox";

/**
 * Stripe → Daythread (Daythread's own billing). Configure this URL (…/api/webhooks/stripe)
 * in the Stripe Dashboard subscribed to: checkout.session.completed,
 * checkout.session.async_payment_succeeded, checkout.session.async_payment_failed,
 * customer.subscription.created / updated / deleted, invoice.paid, invoice.payment_failed.
 * Copy the signing secret into STRIPE_WEBHOOK_SECRET.
 *
 * Signature-verified, then through the shared webhook inbox: the event id is claimed
 * before any work; a redelivery of a processed event is acknowledged and ignored; a
 * failure keeps the verified event for Stripe's retry and the daily run. The database —
 * never the browser redirect — is the source of truth for plans. Nothing about the payload
 * is logged beyond the event type and id.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe billing isn't configured on this deployment." }, { status: 501 });
  }

  let payload: string;
  try {
    payload = await readBoundedText(req, 512 * 1024);
  } catch {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let result: Awaited<ReturnType<typeof handleStripeEvent>> | undefined;
  const run = await runWebhook("stripe", event.id, event, async (e) => { result = await handleStripeEvent(e); });
  if (run.status === "duplicate") return NextResponse.json({ ok: true, duplicate: true });
  if (run.status === "processed") return NextResponse.json({ ok: true, ...result });
  // Failed: a 500 asks Stripe to redeliver; the inbox will process it again.
  return NextResponse.json({ error: "Internal error processing event" }, { status: run.status === "dead" ? 200 : 500 });
}
