import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { verifyOAuthState } from "@/lib/integrations/oauthState";
import { exchangeInstagramCode, instagramProfile, instagramGrantedScopes, subscribeInstagramWebhooks, listInstagramConversations, isProfessionalAccount, IG_SCOPES } from "@/lib/meta/instagram";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { appBaseUrl, metaCredentialsPresent } from "@/lib/meta/config";
import { reportFailure } from "@/lib/observe";
import { track } from "@/lib/analytics";
import { ingestInboundMessage } from "@/server/leadIngestion";
import { activateIntegration } from "@/server/integrationQuota";

/**
 * Instagram Login callback: state → session → membership → code → long-lived token →
 * profile → granted permissions → webhook subscription → first pull of recent DMs.
 *
 * Everything that decides who this connection belongs to comes from the signed state and
 * the authenticated session, never from a query parameter. The code is exchanged
 * server-side; no token is ever put in a URL, a redirect, or the page.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Redirects are built from the deployment's own configured URL, not the request host, so
  // a proxied or preview host can never redirect a completed connection somewhere else.
  const back = new URL("/dashboard/settings", appBaseUrl() || url.origin);
  back.searchParams.set("tab", "connections");
  const fail = (reason: string) => {
    back.searchParams.set("connect_error", reason);
    back.searchParams.set("provider", "INSTAGRAM");
    return NextResponse.redirect(back);
  };

  const error = url.searchParams.get("error");
  if (error) return fail(error === "access_denied" ? "denied" : "provider");
  // Only what completing the exchange actually needs: a flow already in flight is not
  // thrown away because the webhook token is still being wired up.
  if (!metaCredentialsPresent("instagram")) return fail("configuration");

  const verified = await verifyOAuthState("instagram", url.searchParams.get("state"));
  if (!verified.ok) return fail(verified.reason === "expired" ? "expired" : "state");
  const code = url.searchParams.get("code");
  if (!code) return fail("provider");

  const session = await getSession();
  if (!session || session.userId !== verified.state.userId) return fail("session");
  const membership = await prisma.orgMembership.findFirst({ where: { userId: session.userId, businessId: verified.state.businessId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } } });
  if (!membership) return fail("tenant");
  if (process.env.NODE_ENV === "production" && !tokenCryptoConfigured()) return fail("encryption");

  const businessId = verified.state.businessId;
  try {
    const tokens = await exchangeInstagramCode(code);
    const profile = await instagramProfile(tokens.accessToken);
    if (!isProfessionalAccount(profile.account_type)) return fail("account_type");

    // What the token actually carries. A connection without the messaging permission would
    // look connected and fail on every send, so it is refused here instead.
    const granted = await instagramGrantedScopes(tokens.accessToken);
    if (granted && !granted.includes("instagram_business_manage_messages")) return fail("scopes");

    // One Instagram account can only feed one workspace.
    const elsewhere = await prisma.integration.findFirst({ where: { provider: "INSTAGRAM", externalId: profile.id, businessId: { not: businessId }, status: { in: ["CONNECTED", "SYNC_ERROR", "NEEDS_ATTENTION"] } } });
    if (elsewhere) return fail("in_use");

    let webhooksOk = true;
    await subscribeInstagramWebhooks(tokens.accessToken, profile.id).catch(async (err) => {
      webhooksOk = false;
      await reportFailure("oauth", "Instagram webhook subscription failed", { businessId, provider: "INSTAGRAM", error: err, level: "warn" });
    });

    const settings = { instagramUserId: profile.id, username: profile.username, accountType: profile.account_type ?? null, webhooksSubscribed: webhooksOk, scopes: granted ?? IG_SCOPES };
    const credentials = {
      externalAccount: `@${profile.username}`,
      externalId: profile.id,
      accessToken: tokens.accessToken,
      tokenExpiresAt: tokens.expiresAt,
      scopes: (granted ?? IG_SCOPES).join(","),
      settings,
      wanted: false,
    };
    const activation = await activateIntegration({
      businessId,
      provider: "INSTAGRAM",
      create: { ...credentials, lastError: null, lastErrorAt: null },
      update: { ...credentials, lastError: null, lastErrorAt: null, lastSyncStatus: null },
    });
    if (!activation.ok) {
      await track("integration_limit_reached", { businessId, properties: { provider: "INSTAGRAM", plan: activation.usage.plan } });
      return fail("limit");
    }
    const row = activation.row;

    if (!webhooksOk) {
      // Connected, but new DMs will not arrive until Meta accepts the subscription. Said
      // plainly on the card rather than left to look healthy.
      await prisma.integration.update({
        where: { id: row.id },
        data: { lastSyncStatus: "failed", lastError: "Connected, but Instagram didn't accept the webhook subscription — new DMs may not arrive. Reconnect to retry.", lastErrorAt: new Date() },
      });
    }

    // First sync: recent DMs, so the inbox isn't empty until someone writes.
    try {
      const convos = await listInstagramConversations(tokens.accessToken, 20);
      for (const c of convos) {
        const other = c.participants.find((p) => p.id !== profile.id);
        if (!other) continue;
        for (const m of [...c.messages].reverse()) {
          if (m.from?.id === profile.id || !m.message) continue;
          await ingestInboundMessage({
            businessId,
            channel: "INSTAGRAM",
            senderName: other.username ? `@${other.username}` : `Instagram user ${other.id.slice(-4)}`,
            senderHandle: other.id,
            body: m.message,
            providerMessageId: m.id,
          });
        }
      }
      if (webhooksOk) await prisma.integration.update({ where: { id: row.id }, data: { lastSyncedAt: new Date(), lastSyncStatus: "ok" } });
    } catch (err) {
      await prisma.integration.update({ where: { id: row.id }, data: { lastSyncStatus: "failed", lastError: "Connected, but the first sync of recent DMs failed", lastErrorAt: new Date() } });
      await reportFailure("sync", "Instagram first sync failed", { businessId, provider: "INSTAGRAM", error: err, level: "warn" });
    }

    await track("integration_connected", { businessId, properties: { provider: "INSTAGRAM" } });
    back.searchParams.set("connected", "INSTAGRAM");
    return NextResponse.redirect(back);
  } catch (err) {
    await reportFailure("oauth", "Instagram connect failed", { businessId, provider: "INSTAGRAM", error: err });
    await track("integration_failed", { businessId, properties: { provider: "INSTAGRAM", stage: "callback" } });
    return fail("provider");
  }
}
