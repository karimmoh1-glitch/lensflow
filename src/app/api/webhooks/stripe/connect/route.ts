import { NextResponse } from "next/server";
import { readBoundedText } from "@/lib/http";
import type Stripe from "stripe";
import { stripeConnectConfigured, constructConnectEvent } from "@/lib/stripeConnect";
import { handleStripeConnectEvent } from "@/server/stripeConnectEvents";
import { runWebhook } from "@/server/webhookInbox";

/**
 * Stripe → Daythread, for the businesses' own accounts. In the Stripe Dashboard create a
 * second endpoint (…/api/webhooks/stripe/connect) with "Listen to events on Connected
 * accounts", subscribed to payment_intent.succeeded, charge.refunded and
 * account.application.deauthorized; copy its signing secret into
 * STRIPE_CONNECT_WEBHOOK_SECRET. Each event names the account it belongs to, which is how
 * it reaches one workspace and no other.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!stripeConnectConfigured()) return NextResponse.json({ error: "Stripe Connect isn't configured on this deployment." }, { status: 501 });
  let payload: string;
  try {
    payload = await readBoundedText(req, 512 * 1024);
  } catch {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  let event: Stripe.Event;
  try {
    event = constructConnectEvent(payload, req.headers.get("stripe-signature") ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (!event.account) return NextResponse.json({ ok: true, ignored: "no_account" });
  const run = await runWebhook("stripe_connect", event.id, event, async (e) => { await handleStripeConnectEvent(e); });
  if (run.status === "duplicate") return NextResponse.json({ ok: true, duplicate: true });
  if (run.status === "processed") return NextResponse.json({ ok: true });
  return NextResponse.json({ error: "Internal error processing event" }, { status: run.status === "dead" ? 200 : 500 });
}
