import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { verifyOAuthState, consumePkce, type OAuthProvider, type OAuthPurpose } from "@/lib/integrations/oauthState";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { reportFailure } from "@/lib/observe";
import { track } from "@/lib/analytics";
import { activateIntegration } from "@/server/integrationQuota";
import { recordAudit } from "@/server/audit";
import type { OAuthTokens } from "@/lib/integrations/oauth";
import type { Integration, IntegrationProvider, Prisma } from "@prisma/client";

/**
 * The one way an OAuth callback turns into a CONNECTED row, shared by every provider:
 *
 *   1. the state verifies (signed, unexpired, single-use, bound to this browser's nonce,
 *      minted for this provider and purpose);
 *   2. the browser finishing the flow is signed in as the user who started it, and that
 *      user is an owner or admin of the business the flow was started for;
 *   3. tokens can be stored encrypted;
 *   4. the code is exchanged, the provider says who the account is, and an account already
 *      connected to another workspace is refused (when the provider identifies accounts);
 *   5. the plan's connection allowance is enforced inside activateIntegration — refused
 *      means the grant just issued is revoked so nothing dangles on either side;
 *   6. an audit line, an analytics event (provider name only), and a redirect back to the
 *      hub with a reason it can show.
 *
 * Nothing about the provider's answer is logged beyond the failure category.
 */
export type Identity = { externalId: string; externalAccount: string; scopes?: string | null; settings?: Record<string, unknown> };

export type FlowContext = { purpose: OAuthPurpose; provider: IntegrationProvider; businessId: string; userId: string };

export type OAuthConnectSpec = {
  oauthProvider: OAuthProvider;
  /** The purposes this callback serves (Microsoft: mail and calendar) and the row each one owns. */
  purposes: OAuthPurpose[];
  providerFor: (purpose: OAuthPurpose) => IntegrationProvider;
  /** Exchange the code (with the PKCE verifier when the flow used one). */
  exchange: (code: string, codeVerifier: string | null, flow: FlowContext) => Promise<OAuthTokens>;
  identity: (tokens: OAuthTokens, flow: FlowContext) => Promise<Identity>;
  /** Give the grant back when it cannot be kept (plan refused, wrong scopes). */
  revoke?: (tokens: OAuthTokens) => Promise<void>;
  /** Revoke the previous grant when a reconnect replaced it. */
  revokePrevious?: (previous: Integration) => Promise<void>;
  pkce?: boolean;
  requireRefreshToken?: boolean;
  requiredScope?: RegExp;
  /** The same external account may only be connected to one workspace. */
  exclusive?: boolean;
  /** Runs after the row is CONNECTED (initial sync, folder creation, webhook subscription). A throw is reported, never fatal. */
  afterActivate?: (row: Integration, tokens: OAuthTokens, identity: Identity, previous: Integration | null, flow: FlowContext) => Promise<{ redirect?: Record<string, string> } | void>;
};

export async function completeOAuthConnect(req: Request, spec: OAuthConnectSpec): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const back = new URL("/dashboard/settings", url.origin);
  back.searchParams.set("tab", "connections");
  let providerKey: IntegrationProvider = spec.providerFor(spec.purposes[0]);
  const fail = (reason: string) => {
    back.searchParams.set("connect_error", reason);
    back.searchParams.set("provider", providerKey);
    return NextResponse.redirect(back);
  };

  const verified = await verifyOAuthState(spec.oauthProvider, state);
  const codeVerifier = spec.pkce ? await consumePkce(spec.oauthProvider) : null;
  if (verified.ok && spec.purposes.includes(verified.state.purpose)) providerKey = spec.providerFor(verified.state.purpose);
  if (error) return fail(error === "access_denied" || error === "user_denied" ? "denied" : "provider");
  if (!verified.ok) return fail(verified.reason === "expired" ? "expired" : "state");
  if (!spec.purposes.includes(verified.state.purpose)) return fail("state");
  if (!code) return fail("provider");
  if (spec.pkce && !codeVerifier) return fail("state");
  const { businessId, userId } = verified.state;
  const flow: FlowContext = { purpose: verified.state.purpose, provider: providerKey, businessId, userId };

  const session = await getSession();
  if (!session || session.userId !== userId) return fail("session");
  const membership = await prisma.orgMembership.findFirst({ where: { userId, businessId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } } });
  if (!membership) return fail("tenant");
  if (process.env.NODE_ENV === "production" && !tokenCryptoConfigured()) {
    await reportFailure("oauth", `Refused to store ${providerKey} tokens: INTEGRATION_TOKEN_ENCRYPTION_KEY missing`, { businessId, provider: providerKey });
    return fail("encryption");
  }

  let tokens: OAuthTokens | null = null;
  try {
    tokens = await spec.exchange(code, codeVerifier, flow);
    if (spec.requireRefreshToken && !tokens.refreshToken) {
      await spec.revoke?.(tokens);
      return fail("no_refresh_token");
    }
    if (spec.requiredScope && !spec.requiredScope.test(tokens.scope ?? "")) {
      await spec.revoke?.(tokens);
      return fail("scopes");
    }
    const identity = await spec.identity(tokens, flow);
    if (spec.exclusive) {
      const elsewhere = await prisma.integration.findFirst({ where: { provider: providerKey, externalId: identity.externalId, businessId: { not: businessId }, status: { not: "NOT_CONNECTED" } }, select: { id: true } });
      if (elsewhere) {
        await spec.revoke?.(tokens);
        return fail("in_use");
      }
    }
    const previous = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: providerKey } } });
    const base: Omit<Prisma.IntegrationUncheckedCreateInput, "businessId" | "provider" | "status"> = {
      externalAccount: identity.externalAccount,
      externalId: identity.externalId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      tokenExpiresAt: tokens.expiresAt,
      scopes: identity.scopes ?? tokens.scope ?? null,
      settings: (identity.settings ?? {}) as Prisma.InputJsonValue,
      lastError: null,
      lastErrorAt: null,
      lastSyncStatus: null,
      syncCursor: null,
      wanted: false,
    };
    const activation = await activateIntegration({ businessId, provider: providerKey, create: base, update: base });
    if (!activation.ok) {
      await spec.revoke?.(tokens);
      await track("integration_limit_reached", { businessId, properties: { provider: providerKey, plan: activation.usage.plan } });
      return fail("limit");
    }
    if (previous?.refreshToken && previous.refreshToken !== tokens.refreshToken && spec.revokePrevious) await spec.revokePrevious(previous).catch(() => {});

    await recordAudit({ businessId, actorId: userId, action: previous?.status === "CONNECTED" ? "integration.reconnected" : "integration.connected", targetType: "integration", targetId: activation.row.id, metadata: { provider: providerKey } });
    await track("integration_connected", { businessId, properties: { provider: providerKey } });

    let extra: Record<string, string> = { connected: providerKey };
    if (spec.afterActivate) {
      try {
        const r = await spec.afterActivate(activation.row, tokens, identity, previous, flow);
        if (r?.redirect) extra = r.redirect;
      } catch (err) {
        await reportFailure("oauth", `${providerKey} post-connect step failed`, { businessId, provider: providerKey, error: err, level: "warn" });
      }
    }
    for (const [k, v] of Object.entries(extra)) back.searchParams.set(k, v);
    return NextResponse.redirect(back);
  } catch (err) {
    await reportFailure("oauth", `${providerKey} connect failed`, { businessId, provider: providerKey, error: err });
    await track("integration_failed", { businessId, properties: { provider: providerKey, stage: "callback" } });
    if (tokens) await spec.revoke?.(tokens).catch(() => {});
    return fail("provider");
  }
}
