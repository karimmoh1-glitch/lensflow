import type Stripe from "stripe";
import { stripe } from "@/lib/payments";
import { appUrl } from "@/lib/integrations/oauth";

/**
 * Stripe Connect for Standard accounts: the business keeps its own Stripe account, its own
 * dashboard and its own payouts; Daythread is authorized (OAuth) to read what happens there
 * and receives Connect webhooks for it. Daythread never moves money. Requires Connect to be
 * enabled on Daythread's Stripe account and the platform's `ca_…` client id.
 */
const connectClientId = () => process.env.STRIPE_CONNECT_CLIENT_ID;
export const stripeConnectRedirectUri = () => `${appUrl()}/api/auth/stripe/callback`;

export function stripeConnectConfigured(): boolean {
  return Boolean(stripe && connectClientId() && process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
}

export function stripeConnectAuthUrl(state: string, prefill: { email?: string | null; businessName?: string | null; url?: string | null } = {}): string {
  const params = new URLSearchParams({ response_type: "code", client_id: connectClientId()!, scope: "read_write", state, redirect_uri: stripeConnectRedirectUri() });
  if (prefill.email) params.set("stripe_user[email]", prefill.email);
  if (prefill.businessName) params.set("stripe_user[business_name]", prefill.businessName);
  if (prefill.url) params.set("stripe_user[url]", prefill.url);
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

export type ConnectGrant = { accountId: string; scope: string; livemode: boolean; accessToken: string | null; refreshToken: string | null };

export async function exchangeStripeConnectCode(code: string): Promise<ConnectGrant> {
  if (!stripe) throw new Error("Stripe isn't configured on this deployment.");
  const r = await stripe.oauth.token({ grant_type: "authorization_code", code });
  if (!r.stripe_user_id) throw new Error("Stripe returned no account id.");
  return { accountId: r.stripe_user_id, scope: r.scope ?? "read_write", livemode: Boolean(r.livemode), accessToken: r.access_token ?? null, refreshToken: r.refresh_token ?? null };
}

/** Tells Stripe the business disconnected Daythread; the account itself is untouched. */
export async function deauthorizeStripeAccount(accountId: string): Promise<void> {
  if (!stripe || !connectClientId()) return;
  try { await stripe.oauth.deauthorize({ client_id: connectClientId()!, stripe_user_id: accountId }); } catch { /* best effort: already deauthorized */ }
}

export type ConnectedAccountSummary = { id: string; name: string | null; email: string | null; chargesEnabled: boolean; currency: string | null; livemode: boolean };

export async function connectedAccountSummary(accountId: string): Promise<ConnectedAccountSummary> {
  if (!stripe) throw new Error("Stripe isn't configured on this deployment.");
  const a = await stripe.accounts.retrieve(accountId);
  return { id: a.id, name: a.business_profile?.name ?? a.settings?.dashboard?.display_name ?? null, email: a.email ?? null, chargesEnabled: Boolean(a.charges_enabled), currency: a.default_currency ?? null, livemode: !a.id.startsWith("acct_") ? false : Boolean((a as unknown as { livemode?: boolean }).livemode ?? true) };
}

/** Verify a Connect webhook (a separate endpoint and secret from Daythread's own billing webhook). */
export function constructConnectEvent(payload: string, signature: string): Stripe.Event {
  if (!stripe) throw new Error("Stripe isn't configured on this deployment.");
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_CONNECT_WEBHOOK_SECRET is not configured.");
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

/** Who paid, from the charge behind a payment intent on the connected account. */
export async function connectedChargeDetails(accountId: string, chargeId: string): Promise<{ name: string | null; email: string | null; phone: string | null; receiptUrl: string | null }> {
  if (!stripe) throw new Error("Stripe isn't configured on this deployment.");
  const c = await stripe.charges.retrieve(chargeId, {}, { stripeAccount: accountId });
  return { name: c.billing_details?.name ?? null, email: c.billing_details?.email ?? c.receipt_email ?? null, phone: c.billing_details?.phone ?? null, receiptUrl: c.receipt_url ?? null };
}
