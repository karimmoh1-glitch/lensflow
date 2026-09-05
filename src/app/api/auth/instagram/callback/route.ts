import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { verifyOAuthState } from "@/lib/integrations/oauthState";
import { exchangeInstagramCode, instagramProfile, subscribeInstagramWebhooks, listInstagramConversations } from "@/lib/meta/instagram";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { reportFailure } from "@/lib/observe";
import { track } from "@/lib/analytics";
import { ingestInboundMessage } from "@/server/leadIngestion";

/** Instagram Login callback: code → long-lived token → profile → subscribed to webhooks →
 * first pull of recent conversations. Only a professional account can complete this. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = new URL("/dashboard/settings", url.origin);
  back.searchParams.set("tab", "connections");
  const fail = (reason: string) => {
    back.searchParams.set("connect_error", reason);
    back.searchParams.set("provider", "INSTAGRAM");
    return NextResponse.redirect(back);
  };
  const error = url.searchParams.get("error");
  if (error) return fail(error === "access_denied" ? "denied" : "provider");
  const verified = await verifyOAuthState("instagram", url.searchParams.get("state"));
  if (!verified.ok) return fail(verified.reason === "expired" ? "expired" : "state");
  const code = url.searchParams.get("code");
  if (!code) return fail("provider");
  const session = await getSession();
  if (!session || session.userId !== verified.state.userId) return fail("session");
  const membership = await prisma.orgMembership.findFirst({ where: { userId: session.userId, businessId: verified.state.businessId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } } });
  if (!membership) return fail("tenant");
  if (process.env.NODE_ENV === "production" && !tokenCryptoConfigured()) return fail("encryption");

  try {
    const tokens = await exchangeInstagramCode(code);
    const profile = await instagramProfile(tokens.accessToken);
    if (profile.account_type && !/BUSINESS|MEDIA_CREATOR|CREATOR/i.test(profile.account_type)) return fail("account_type");
    // One Instagram account can only feed one workspace.
    const elsewhere = await prisma.integration.findFirst({ where: { provider: "INSTAGRAM", externalId: profile.id, businessId: { not: verified.state.businessId }, status: { not: "NOT_CONNECTED" } } });
    if (elsewhere) return fail("in_use");
    await subscribeInstagramWebhooks(tokens.accessToken, profile.id).catch((err) => reportFailure("oauth", "Instagram webhook subscription failed", { businessId: verified.state.businessId, provider: "INSTAGRAM", error: err, level: "warn" }));
    const row = await prisma.integration.upsert({
      where: { businessId_provider: { businessId: verified.state.businessId, provider: "INSTAGRAM" } },
      create: { businessId: verified.state.businessId, provider: "INSTAGRAM", status: "CONNECTED", externalAccount: `@${profile.username}`, externalId: profile.id, accessToken: tokens.accessToken, tokenExpiresAt: tokens.expiresAt, scopes: "instagram_business_basic,instagram_business_manage_messages", lastError: null, lastErrorAt: null, wanted: false },
      update: { status: "CONNECTED", externalAccount: `@${profile.username}`, externalId: profile.id, accessToken: tokens.accessToken, tokenExpiresAt: tokens.expiresAt, lastError: null, lastErrorAt: null, lastSyncStatus: null, wanted: false },
    });
    // First sync: recent DMs, so the inbox isn't empty until someone writes.
    try {
      const convos = await listInstagramConversations(tokens.accessToken, 20);
      for (const c of convos) {
        const other = c.participants.find((p) => p.id !== profile.id);
        if (!other) continue;
        for (const m of [...c.messages].reverse()) {
          if (m.from.id === profile.id || !m.message) continue;
          await ingestInboundMessage({ businessId: verified.state.businessId, channel: "INSTAGRAM", senderName: other.username ? `@${other.username}` : `Instagram user ${other.id.slice(-4)}`, senderHandle: other.id, body: m.message, providerMessageId: m.id });
        }
      }
      await prisma.integration.update({ where: { id: row.id }, data: { lastSyncedAt: new Date(), lastSyncStatus: "ok" } });
    } catch (err) {
      await prisma.integration.update({ where: { id: row.id }, data: { lastSyncStatus: "failed", lastError: "Connected, but the first sync of recent DMs failed", lastErrorAt: new Date() } });
      await reportFailure("sync", "Instagram first sync failed", { businessId: verified.state.businessId, provider: "INSTAGRAM", error: err, level: "warn" });
    }
    await track("integration_connected", { businessId: verified.state.businessId, properties: { provider: "INSTAGRAM" } });
    back.searchParams.set("connected", "INSTAGRAM");
    return NextResponse.redirect(back);
  } catch (err) {
    await reportFailure("oauth", "Instagram connect failed", { businessId: verified.state.businessId, provider: "INSTAGRAM", error: err });
    await track("integration_failed", { businessId: verified.state.businessId, properties: { provider: "INSTAGRAM", stage: "callback" } });
    return fail("provider");
  }
}
