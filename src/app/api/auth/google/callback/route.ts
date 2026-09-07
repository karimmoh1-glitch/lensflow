import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { exchangeCodeForTokens, getGoogleUserEmail, revokeGoogleToken } from "@/lib/google";
import { verifyOAuthState } from "@/lib/integrations/oauthState";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { reportFailure } from "@/lib/observe";
import { track } from "@/lib/analytics";
import { activateIntegration } from "@/server/integrationQuota";

/**
 * Where Google sends the owner back after the Gmail consent screen. Nothing here trusts the query string alone: the
 * state must verify (signed, unexpired, single-use, bound to this browser's nonce), the
 * signed-in session must belong to the business the flow was started for, and the
 * provider account is recorded so later events can be matched to it. This is the only
 * place an EMAIL / GOOGLE_CALENDAR row becomes CONNECTED.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const back = new URL("/dashboard/settings", url.origin);
  back.searchParams.set("tab", "channels");
  const fail = (reason: string, provider = "google") => {
    back.searchParams.set("connect_error", reason);
    back.searchParams.set("provider", provider);
    return NextResponse.redirect(back);
  };

  if (error) return fail(error === "access_denied" ? "denied" : "provider");
  const verified = await verifyOAuthState("google", state);
  if (!verified.ok) return fail(verified.reason === "expired" ? "expired" : "state");
  if (!code) return fail("provider");
  const purpose = "gmail" as const;
  const providerKey = "EMAIL" as const;

  // Tenant binding: the browser finishing this flow must be signed in to the business that started it.
  const session = await getSession();
  if (!session || session.userId !== verified.state.userId) return fail("session", providerKey);
  const membership = await prisma.orgMembership.findFirst({ where: { userId: session.userId, businessId: verified.state.businessId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } } });
  if (!membership) return fail("tenant", providerKey);
  if (process.env.NODE_ENV === "production" && !tokenCryptoConfigured()) {
    await reportFailure("oauth", "Refused to store Google tokens: INTEGRATION_TOKEN_ENCRYPTION_KEY missing", { businessId: verified.state.businessId, provider: providerKey });
    return fail("encryption", providerKey);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await getGoogleUserEmail(tokens.access_token);
    if (!tokens.refresh_token) {
      await revokeGoogleToken(tokens.access_token);
      return fail("no_refresh_token", providerKey);
    }
    const granted = tokens.scope ?? "";
    const needed = /gmail/;
    if (!needed.test(granted)) {
      await revokeGoogleToken(tokens.access_token);
      return fail("scopes", providerKey);
    }

    // Reconnect replaces stale credentials; the old grant is told to go away.
    const existing = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: verified.state.businessId, provider: providerKey } } });
    if (existing?.refreshToken && existing.refreshToken !== tokens.refresh_token) await revokeGoogleToken(existing.refreshToken);

    const base = { externalAccount: email, externalId: email, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000), scopes: granted, lastError: null, lastErrorAt: null, lastSyncStatus: null, syncCursor: null, wanted: false };
    // The plan's connected-integrations allowance is enforced here, inside a row-locked
    // transaction — the one place this row can become CONNECTED. Refused: the grant Google
    // just issued is revoked so nothing is left dangling on either side.
    const activation = await activateIntegration({ businessId: verified.state.businessId, provider: providerKey, create: { ...base, lastSyncedAt: new Date() }, update: base });
    if (!activation.ok) {
      await revokeGoogleToken(tokens.refresh_token);
      await track("integration_limit_reached", { businessId: verified.state.businessId, properties: { provider: providerKey, plan: activation.usage.plan } });
      return fail("limit", providerKey);
    }

    await track("integration_connected", { businessId: verified.state.businessId, properties: { provider: providerKey } });
    back.searchParams.set("connected", providerKey);
    // A brand-new inbox connecting its first channel is still in onboarding: land back there.
    const onboarding = await prisma.business.findUnique({ where: { id: verified.state.businessId }, select: { onboardingComplete: true } });
    if (onboarding && !onboarding.onboardingComplete) {
      back.pathname = "/onboarding";
      back.searchParams.delete("tab");
      back.searchParams.set("step", "connect");
    }
    return NextResponse.redirect(back);
  } catch (err) {
    await reportFailure("oauth", `Google ${purpose} connect failed`, { businessId: verified.state.businessId, provider: providerKey, error: err });
    await track("integration_failed", { businessId: verified.state.businessId, properties: { provider: providerKey, stage: "callback" } });
    return fail("provider", providerKey);
  }
}
