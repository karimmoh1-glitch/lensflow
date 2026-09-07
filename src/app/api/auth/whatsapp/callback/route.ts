import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { verifyOAuthState } from "@/lib/integrations/oauthState";
import { exchangeWhatsAppCode, discoverWabas, listPhoneNumbers, subscribeWabaWebhooks, wabaDetail, type WaPhone } from "@/lib/meta/whatsapp";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { appBaseUrl, metaCredentialsPresent } from "@/lib/meta/config";
import { reportFailure } from "@/lib/observe";
import { track } from "@/lib/analytics";
import { activateIntegration } from "@/server/integrationQuota";

/**
 * Embedded Signup callback: state → session → membership → code → business token → the
 * WABAs the token was *granted* for (read from Meta's debug_token, never from the browser)
 * → their phone numbers → webhook subscription → one connected number.
 *
 * Every WhatsApp id Daythread stores has been confirmed by Meta as belonging to this
 * token. A phone number id posted by a browser is never trusted; the Manage sheet can only
 * switch between numbers that appear in this discovery.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type WaSettings = {
  wabaId: string;
  wabaName?: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating?: string | null;
  codeVerificationStatus?: string | null;
  webhooksSubscribed: boolean;
  /** Every number Meta confirmed this token owns, so switching never needs the browser's word. */
  availableNumbers: Array<{ id: string; wabaId: string; displayPhoneNumber: string; verifiedName: string; codeVerificationStatus?: string | null }>;
};

/** A number that is verified and registered is preferred over one that still needs setup. */
function rank(p: WaPhone): number {
  return (p.code_verification_status === "VERIFIED" ? 2 : 0) + (p.platform_type === "CLOUD_API" ? 1 : 0);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = new URL("/dashboard/settings", appBaseUrl() || url.origin);
  back.searchParams.set("tab", "channels");
  const fail = (reason: string) => {
    back.searchParams.set("connect_error", reason);
    back.searchParams.set("provider", "WHATSAPP");
    return NextResponse.redirect(back);
  };

  const error = url.searchParams.get("error");
  if (error) return fail(error === "access_denied" ? "denied" : "provider");
  if (!metaCredentialsPresent("whatsapp")) return fail("configuration");

  const verified = await verifyOAuthState("whatsapp", url.searchParams.get("state"));
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
    const tokens = await exchangeWhatsAppCode(code);
    const wabas = await discoverWabas(tokens.accessToken);
    if (wabas.length === 0) return fail("no_waba");

    // Every number across every granted WABA, so a business with more than one can choose.
    const available: WaSettings["availableNumbers"] = [];
    let chosen: { wabaId: string; phone: WaPhone } | null = null;
    for (const wabaId of wabas) {
      const phones = await listPhoneNumbers(tokens.accessToken, wabaId).catch(() => [] as WaPhone[]);
      for (const p of phones) {
        available.push({ id: p.id, wabaId, displayPhoneNumber: p.display_phone_number, verifiedName: p.verified_name, codeVerificationStatus: p.code_verification_status ?? null });
        if (!chosen || rank(p) > rank(chosen.phone)) chosen = { wabaId, phone: p };
      }
    }
    if (!chosen) return fail("no_phone");

    // One WhatsApp number can only feed one workspace.
    const elsewhere = await prisma.integration.findFirst({ where: { provider: "WHATSAPP", externalId: chosen.phone.id, businessId: { not: businessId }, status: { in: ["CONNECTED", "SYNC_ERROR", "NEEDS_ATTENTION"] } } });
    if (elsewhere) return fail("in_use");

    let webhooksOk = true;
    await subscribeWabaWebhooks(tokens.accessToken, chosen.wabaId).catch(async (err) => {
      webhooksOk = false;
      await reportFailure("oauth", "WhatsApp webhook subscription failed", { businessId, provider: "WHATSAPP", error: err, level: "warn" });
    });
    const detail = await wabaDetail(tokens.accessToken, chosen.wabaId);

    const settings: WaSettings = {
      wabaId: chosen.wabaId,
      wabaName: detail?.name ?? null,
      phoneNumberId: chosen.phone.id,
      displayPhoneNumber: chosen.phone.display_phone_number,
      verifiedName: chosen.phone.verified_name,
      qualityRating: chosen.phone.quality_rating ?? null,
      codeVerificationStatus: chosen.phone.code_verification_status ?? null,
      webhooksSubscribed: webhooksOk,
      availableNumbers: available,
    };
    const credentials = {
      externalAccount: `${chosen.phone.verified_name} · ${chosen.phone.display_phone_number}`,
      externalId: chosen.phone.id,
      accessToken: tokens.accessToken,
      tokenExpiresAt: tokens.expiresAt,
      settings: settings as unknown as object,
      scopes: "whatsapp_business_management,whatsapp_business_messaging",
      wanted: false,
    };
    const activation = await activateIntegration({
      businessId,
      provider: "WHATSAPP",
      create: { ...credentials, lastSyncedAt: new Date(), lastSyncStatus: webhooksOk ? "ok" : "failed", lastError: webhooksOk ? null : subscriptionWarning, lastErrorAt: webhooksOk ? null : new Date() },
      update: { ...credentials, lastSyncedAt: new Date(), lastSyncStatus: webhooksOk ? "ok" : "failed", lastError: webhooksOk ? null : subscriptionWarning, lastErrorAt: webhooksOk ? null : new Date() },
    });
    if (!activation.ok) {
      await track("integration_limit_reached", { businessId, properties: { provider: "WHATSAPP", plan: activation.usage.plan } });
      return fail("limit");
    }

    await track("integration_connected", { businessId, properties: { provider: "WHATSAPP" } });
    back.searchParams.set("connected", "WHATSAPP");
    // A brand-new inbox connecting its first channel is still in onboarding: land back there.
    const onboarding = await prisma.business.findUnique({ where: { id: verified.state.businessId }, select: { onboardingComplete: true } });
    if (onboarding && !onboarding.onboardingComplete) {
      back.pathname = "/onboarding";
      back.searchParams.delete("tab");
      back.searchParams.set("step", "connect");
    }
    return NextResponse.redirect(back);
  } catch (err) {
    await reportFailure("oauth", "WhatsApp connect failed", { businessId, provider: "WHATSAPP", error: err });
    await track("integration_failed", { businessId, properties: { provider: "WHATSAPP", stage: "callback" } });
    return fail("provider");
  }
}

const subscriptionWarning = "Connected, but Meta didn't accept the webhook subscription — incoming messages may not arrive. Reconnect to retry.";
