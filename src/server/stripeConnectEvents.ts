import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { connectedChargeDetails } from "@/lib/stripeConnect";
import { findKnownClient } from "@/server/identity";
import { notifyBusiness } from "@/server/notify";
import { recordAudit } from "@/server/audit";
import { formatMoneyExact } from "@/lib/utils";

/**
 * Events from the businesses' own Stripe accounts (Connect webhooks). A successful
 * payment is recorded once as a Payment against the person who paid — matched by the
 * card's billing email or phone, else a new customer record — and the owner is told.
 * A refund updates the same row. A business that removes Daythread from its Stripe
 * account is marked disconnected; nothing is ever charged, moved or refunded from here.
 */
export type ConnectOutcome = { handled: string; businessId?: string | null };

export async function handleStripeConnectEvent(event: Stripe.Event): Promise<ConnectOutcome> {
  const accountId = event.account;
  if (!accountId) return { handled: "no_account" };
  // Only a row that still holds this account. A deauthorized row keeps its history but
  // releases the account id, so a business that later connects the same Stripe account to
  // another workspace receives its own events instead of them landing on the stale row and
  // being discarded as "inactive".
  const row =
    (await prisma.integration.findFirst({ where: { provider: "STRIPE", externalId: accountId, status: { not: "NOT_CONNECTED" } }, orderBy: { updatedAt: "desc" } })) ??
    (await prisma.integration.findFirst({ where: { provider: "STRIPE", externalId: accountId }, orderBy: { updatedAt: "desc" } }));
  if (!row) return { handled: "unknown_account" };
  const businessId = row.businessId;

  if (event.type === "account.application.deauthorized") {
    await prisma.integration.update({ where: { id: row.id }, data: { status: "NOT_CONNECTED", accessToken: null, refreshToken: null, tokenExpiresAt: null, externalId: null, lastError: null, lastErrorAt: null, lastSyncStatus: null } });
    await recordAudit({ businessId, action: "integration.disconnected", targetType: "integration", targetId: row.id, metadata: { provider: "STRIPE", by: "provider" } });
    await notifyBusiness(businessId, { kind: "integration", title: "Stripe disconnected", body: "Daythread's access was removed from your Stripe account. Reconnect from Settings if that wasn't you.", target: { kind: "integrations" } });
    return { handled: "deauthorized", businessId };
  }

  if (row.status === "NOT_CONNECTED") return { handled: "inactive", businessId };
  await prisma.integration.update({ where: { id: row.id }, data: { lastWebhookAt: new Date() } });

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    return { handled: await recordPayment(businessId, accountId, pi), businessId };
  }
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (!piId) return { handled: "refund_without_intent", businessId };
    const r = await prisma.payment.updateMany({ where: { businessId, stripePaymentIntentId: piId }, data: { status: "REFUNDED" } });
    return { handled: r.count ? "refunded" : "refund_unknown_payment", businessId };
  }
  return { handled: "ignored", businessId };
}

async function recordPayment(businessId: string, accountId: string, pi: Stripe.PaymentIntent): Promise<string> {
  if (pi.status !== "succeeded") return "not_succeeded";
  const existing = await prisma.payment.findFirst({ where: { businessId, stripePaymentIntentId: pi.id }, select: { id: true } });
  if (existing) return "already_recorded";
  const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
  const details = chargeId ? await connectedChargeDetails(accountId, chargeId).catch(() => null) : null;
  const email = details?.email ?? pi.receipt_email ?? null;
  const phone = details?.phone ?? null;
  const name = details?.name ?? (email ? email.split("@")[0] : "Stripe customer");
  const known = email || phone ? await findKnownClient({ businessId, channel: "EMAIL", senderHandle: email ?? phone ?? "", senderName: name, email, phone }) : null;
  const client = known?.client
    ? await prisma.client.update({ where: { id: known.client.id }, data: { relationship: "CUSTOMER" } })
    : await prisma.client.create({ data: { businessId, name, email: known?.email ?? email, phone: known?.phone ?? phone, relationship: "CUSTOMER" } });
  const amountCents = pi.amount_received ?? pi.amount;
  const currency = (pi.currency ?? "usd").toLowerCase();
  const payment = await prisma.payment.create({ data: { businessId, clientId: client.id, method: "CARD", purpose: "FULL", amountCents, currency, status: "PAID", stripePaymentIntentId: pi.id, confirmedAt: new Date((pi.created ?? Math.floor(Date.now() / 1000)) * 1000), reference: pi.description?.slice(0, 120) ?? null } });
  await recordAudit({ businessId, action: "payment.recorded", targetType: "payment", targetId: payment.id, metadata: { provider: "STRIPE", amountCents, currency: pi.currency } });
  const money = formatMoneyExact(amountCents, currency);
  await notifyBusiness(businessId, { kind: "payment", title: "Payment received", body: `${money} from ${client.name} via Stripe.`, target: { kind: "payments" } });
  return "recorded";
}
