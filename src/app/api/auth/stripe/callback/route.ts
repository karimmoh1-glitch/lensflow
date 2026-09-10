import { completeOAuthConnect } from "@/server/oauthConnect";
import { exchangeStripeConnectCode, connectedAccountSummary, deauthorizeStripeAccount } from "@/lib/stripeConnect";

/**
 * Stripe Connect's callback: the business authorized Daythread on its own Stripe account.
 * Standard accounts are addressed with Daythread's key plus the account id, so the account
 * id is the identity and the (optional) tokens Stripe returns are stored encrypted like
 * every other credential.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return completeOAuthConnect(req, {
    oauthProvider: "stripe",
    purposes: ["payments"],
    providerFor: () => "STRIPE",
    exclusive: true,
    exchange: async (code) => {
      const g = await exchangeStripeConnectCode(code);
      return { accessToken: g.accessToken ?? g.accountId, refreshToken: g.refreshToken ?? null, expiresAt: null, scope: g.scope, raw: { accountId: g.accountId, livemode: g.livemode } };
    },
    identity: async (tokens) => {
      const raw = tokens.raw as { accountId: string; livemode: boolean };
      const summary = await connectedAccountSummary(raw.accountId).catch(() => null);
      return { externalId: raw.accountId, externalAccount: summary?.name ?? summary?.email ?? raw.accountId, scopes: tokens.scope, settings: { accountId: raw.accountId, livemode: raw.livemode, chargesEnabled: summary?.chargesEnabled ?? null, currency: summary?.currency ?? null, email: summary?.email ?? null } };
    },
    revoke: async (tokens) => { const raw = tokens.raw as { accountId?: string }; if (raw.accountId) await deauthorizeStripeAccount(raw.accountId); },
  });
}
