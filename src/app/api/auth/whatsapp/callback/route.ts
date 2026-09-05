import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { verifyOAuthState } from "@/lib/integrations/oauthState";
import { exchangeWhatsAppCode, discoverWabas, listPhoneNumbers, subscribeWabaWebhooks } from "@/lib/meta/whatsapp";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { reportFailure } from "@/lib/observe";
import { track } from "@/lib/analytics";

/** Embedded Signup callback: code → business token → WABA and phone number → webhooks
 * subscribed. Registration (two-step PIN) is left to Meta's own flow when a number is new. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = new URL("/dashboard/settings", url.origin);
  back.searchParams.set("tab", "connections");
  const fail = (reason: string) => {
    back.searchParams.set("connect_error", reason);
    back.searchParams.set("provider", "WHATSAPP");
    return NextResponse.redirect(back);
  };
  const error = url.searchParams.get("error");
  if (error) return fail(error === "access_denied" ? "denied" : "provider");
  const verified = await verifyOAuthState("whatsapp", url.searchParams.get("state"));
  if (!verified.ok) return fail(verified.reason === "expired" ? "expired" : "state");
  const code = url.searchParams.get("code");
  if (!code) return fail("provider");
  const session = await getSession();
  if (!session || session.userId !== verified.state.userId) return fail("session");
  const membership = await prisma.orgMembership.findFirst({ where: { userId: session.userId, businessId: verified.state.businessId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } } });
  if (!membership) return fail("tenant");
  if (process.env.NODE_ENV === "production" && !tokenCryptoConfigured()) return fail("encryption");

  try {
    const tokens = await exchangeWhatsAppCode(code);
    const wabas = await discoverWabas(tokens.accessToken);
    if (wabas.length === 0) return fail("no_waba");
    let chosen: { wabaId: string; phone: { id: string; display_phone_number: string; verified_name: string } } | null = null;
    for (const wabaId of wabas) {
      const phones = await listPhoneNumbers(tokens.accessToken, wabaId);
      if (phones[0]) { chosen = { wabaId, phone: phones[0] }; break; }
    }
    if (!chosen) return fail("no_phone");
    const elsewhere = await prisma.integration.findFirst({ where: { provider: "WHATSAPP", externalId: chosen.phone.id, businessId: { not: verified.state.businessId }, status: { not: "NOT_CONNECTED" } } });
    if (elsewhere) return fail("in_use");
    await subscribeWabaWebhooks(tokens.accessToken, chosen.wabaId);
    await prisma.integration.upsert({
      where: { businessId_provider: { businessId: verified.state.businessId, provider: "WHATSAPP" } },
      create: { businessId: verified.state.businessId, provider: "WHATSAPP", status: "CONNECTED", externalAccount: `${chosen.phone.verified_name} · ${chosen.phone.display_phone_number}`, externalId: chosen.phone.id, accessToken: tokens.accessToken, tokenExpiresAt: tokens.expiresAt, settings: { wabaId: chosen.wabaId, phoneNumberId: chosen.phone.id, displayPhoneNumber: chosen.phone.display_phone_number }, scopes: "whatsapp_business_management,whatsapp_business_messaging", lastSyncedAt: new Date(), lastSyncStatus: "ok", wanted: false },
      update: { status: "CONNECTED", externalAccount: `${chosen.phone.verified_name} · ${chosen.phone.display_phone_number}`, externalId: chosen.phone.id, accessToken: tokens.accessToken, tokenExpiresAt: tokens.expiresAt, settings: { wabaId: chosen.wabaId, phoneNumberId: chosen.phone.id, displayPhoneNumber: chosen.phone.display_phone_number }, lastError: null, lastErrorAt: null, lastSyncedAt: new Date(), lastSyncStatus: "ok", wanted: false },
    });
    await track("integration_connected", { businessId: verified.state.businessId, properties: { provider: "WHATSAPP" } });
    back.searchParams.set("connected", "WHATSAPP");
    return NextResponse.redirect(back);
  } catch (err) {
    await reportFailure("oauth", "WhatsApp connect failed", { businessId: verified.state.businessId, provider: "WHATSAPP", error: err });
    await track("integration_failed", { businessId: verified.state.businessId, properties: { provider: "WHATSAPP", stage: "callback" } });
    return fail("provider");
  }
}
