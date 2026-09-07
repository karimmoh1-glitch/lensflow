"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { signOAuthState } from "@/lib/integrations/oauthState";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { instagramConfigured, instagramAuthUrl, unsubscribeInstagramWebhooks } from "@/lib/meta/instagram";
import { whatsappConfigured, whatsappAuthUrl, unsubscribeWabaWebhooks, listPhoneNumbers, tokenOwnsWaba } from "@/lib/meta/whatsapp";
import { twilioConfigured, searchNumbers, provisionNumber, releaseNumber } from "@/lib/twilio";
import { smsEntitled } from "@/lib/billing";
import { track } from "@/lib/analytics";
import { reportFailure } from "@/lib/observe";
import { disconnectGoogle } from "@/app/actions/googleAuth";
import { activateIntegration, canActivate, limitMessage } from "@/server/integrationQuota";
import type { IntegrationProvider } from "@prisma/client";

const ADMIN = ["OWNER", "ADMIN"] as const;

function guardEncryption() {
  if (process.env.NODE_ENV === "production" && !tokenCryptoConfigured()) throw new Error("Connections are paused until the deployment's encryption key is configured.");
}

/** Before sending someone to a provider: if the plan has no free slot, come straight back
 * with the reason instead of a wasted trip. The callback enforces it again, atomically. */
async function guardQuotaOrRedirect(businessId: string, provider: IntegrationProvider) {
  const check = await canActivate(businessId, provider);
  if (check.ok) return;
  await track("integration_limit_reached", { businessId, properties: { provider, plan: check.usage.plan, stage: "start" } });
  redirect(`/dashboard/settings?tab=channels&connect_error=limit&provider=${provider}`);
}

/** Instagram: Meta's own authorization screen. Professional accounts only. */
export async function connectInstagram(session?: SessionPayload | null) {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  if (!instagramConfigured()) throw new Error("Instagram isn't configured on this deployment.");
  guardEncryption();
  await guardQuotaOrRedirect(ctx.business.id, "INSTAGRAM");
  await track("integration_connect_started", { businessId: ctx.business.id, properties: { provider: "INSTAGRAM" } });
  const state = await signOAuthState({ provider: "instagram", purpose: "messaging", businessId: ctx.business.id, userId: ctx.session.userId });
  redirect(instagramAuthUrl(state));
}

/** WhatsApp: Meta's Embedded Signup (Facebook Login for Business). */
export async function connectWhatsApp(session?: SessionPayload | null) {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  if (!whatsappConfigured()) throw new Error("WhatsApp isn't configured on this deployment.");
  guardEncryption();
  await guardQuotaOrRedirect(ctx.business.id, "WHATSAPP");
  await track("integration_connect_started", { businessId: ctx.business.id, properties: { provider: "WHATSAPP" } });
  const state = await signOAuthState({ provider: "whatsapp", purpose: "messaging", businessId: ctx.business.id, userId: ctx.session.userId });
  redirect(whatsappAuthUrl(state));
}

/** Disconnect for every provider: credentials erased, sync stopped, provider grant revoked
 * where the provider offers revocation (Google). Tenant-scoped: only this business's row. */
export async function disconnectIntegration(provider: IntegrationProvider, session?: SessionPayload | null): Promise<{ error?: string }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  if (provider === "EMAIL") {
    await disconnectGoogle("EMAIL", session);
    return {};
  }
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider } } });
  if (!row) return { error: "Nothing to disconnect." };
  // Tell Meta to stop delivering first, while the credential still works. Best effort: a
  // provider that refuses must never leave the user unable to disconnect locally, and the
  // webhook ignores events for a row that is no longer connected either way.
  if ((provider === "INSTAGRAM" || provider === "WHATSAPP") && row.accessToken) {
    await revokeMetaSubscription(provider, row).catch((err) =>
      reportFailure("oauth", `${provider} webhook unsubscribe failed on disconnect`, { businessId: ctx.business.id, provider, error: err, level: "warn" })
    );
  }
  await prisma.externalEvent.deleteMany({ where: { integrationId: row.id } });
  await prisma.integration.update({ where: { id: row.id }, data: { status: "NOT_CONNECTED", accessToken: null, refreshToken: null, tokenExpiresAt: null, externalAccount: null, externalId: null, scopes: null, syncCursor: null, settings: undefined, lastSyncStatus: null, lastError: null, lastErrorAt: null } });
  await track("integration_disconnected", { businessId: ctx.business.id, properties: { provider } });
  revalidatePath("/dashboard/settings");
  return {};
}

/** SMS: a dedicated number for this business, bought from Daythread's Twilio account. */
export async function searchSmsNumbers(areaCode?: string): Promise<{ numbers: Array<{ phoneNumber: string; friendlyName: string; locality: string | null; region: string | null }>; error?: string }> {
  const ctx = await requireRole([...ADMIN]);
  if (!ctx) return { numbers: [], error: "unauthorized" };
  if (!twilioConfigured()) return { numbers: [], error: "Text messaging isn't available on this deployment yet." };
  if (!smsEntitled(ctx.business)) return { numbers: [], error: "A text number is part of the Pro plan and above." };
  try {
    return { numbers: await searchNumbers(areaCode?.replace(/\D/g, "").slice(0, 3) || undefined) };
  } catch (err) {
    await reportFailure("oauth", "Twilio number search failed", { businessId: ctx.business.id, provider: "SMS", error: err });
    return { numbers: [], error: "Couldn't search for numbers just now." };
  }
}

export async function claimSmsNumber(phoneNumber: string): Promise<{ error?: string; phoneNumber?: string }> {
  const ctx = await requireRole([...ADMIN]);
  if (!ctx) throw new Error("unauthorized");
  if (!twilioConfigured()) return { error: "Text messaging isn't available on this deployment yet." };
  if (!smsEntitled(ctx.business)) return { error: "A text number is part of the Pro plan and above." };
  if (ctx.business.twilioPhoneNumber) return { error: "This business already has a number." };
  if (!/^\+\d{8,15}$/.test(phoneNumber)) return { error: "Choose a number from the list." };
  const slot = await canActivate(ctx.business.id, "SMS");
  if (!slot.ok) {
    await track("integration_limit_reached", { businessId: ctx.business.id, properties: { provider: "SMS", plan: slot.usage.plan, stage: "start" } });
    return { error: limitMessage(slot.usage) };
  }
  try {
    const bought = await provisionNumber(phoneNumber, ctx.business.name);
    const activation = await activateIntegration({
      businessId: ctx.business.id,
      provider: "SMS",
      create: { externalAccount: bought.phoneNumber, externalId: bought.sid, lastSyncedAt: new Date(), lastSyncStatus: "ok", wanted: false },
      update: { externalAccount: bought.phoneNumber, externalId: bought.sid, lastSyncedAt: new Date(), lastSyncStatus: "ok", lastError: null, lastErrorAt: null, wanted: false },
    });
    if (!activation.ok) {
      // Lost the race with another connection: give the number back, keep nothing.
      await releaseNumber(bought.sid).catch((err) => reportFailure("oauth", "Twilio release after quota refusal failed", { businessId: ctx.business.id, provider: "SMS", error: err, level: "warn" }));
      await track("integration_limit_reached", { businessId: ctx.business.id, properties: { provider: "SMS", plan: activation.usage.plan } });
      return { error: limitMessage(activation.usage) };
    }
    await prisma.business.update({ where: { id: ctx.business.id }, data: { twilioPhoneNumber: bought.phoneNumber } });
    await track("integration_connected", { businessId: ctx.business.id, properties: { provider: "SMS" } });
    revalidatePath("/dashboard/settings");
    return { phoneNumber: bought.phoneNumber };
  } catch (err) {
    await reportFailure("oauth", "Twilio number purchase failed", { businessId: ctx.business.id, provider: "SMS", error: err });
    await track("integration_failed", { businessId: ctx.business.id, properties: { provider: "SMS", stage: "provision" } });
    return { error: "Couldn't get that number. It may have just been taken — search again." };
  }
}

export async function releaseSmsNumber(): Promise<{ error?: string }> {
  const ctx = await requireRole([...ADMIN]);
  if (!ctx) throw new Error("unauthorized");
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "SMS" } } });
  if (row?.externalId && twilioConfigured()) await releaseNumber(row.externalId);
  await prisma.business.update({ where: { id: ctx.business.id }, data: { twilioPhoneNumber: null } });
  if (row) await prisma.integration.update({ where: { id: row.id }, data: { status: "NOT_CONNECTED", externalAccount: null, externalId: null, lastSyncStatus: null } });
  await track("integration_disconnected", { businessId: ctx.business.id, properties: { provider: "SMS" } });
  revalidatePath("/dashboard/settings");
  return {};
}

/**
 * Stops Meta sending this account's events to Daythread. Instagram unsubscribes the
 * connected account; WhatsApp unsubscribes the WABA the phone number belongs to.
 * Meta offers no token-revocation endpoint for Instagram Login, so the stored credential is
 * erased here and the user can also remove Daythread from their Instagram settings — the
 * disconnect UI says so rather than implying a revocation that did not happen.
 */
async function revokeMetaSubscription(provider: IntegrationProvider, row: { accessToken: string | null; externalId: string | null; settings: unknown }): Promise<void> {
  if (!row.accessToken) return;
  if (provider === "INSTAGRAM" && row.externalId) {
    await unsubscribeInstagramWebhooks(row.accessToken, row.externalId);
    return;
  }
  if (provider === "WHATSAPP") {
    const wabaId = (row.settings as { wabaId?: string } | null)?.wabaId;
    if (wabaId) await unsubscribeWabaWebhooks(row.accessToken, wabaId);
  }
}

/**
 * Switch the connected WhatsApp number. The id arrives from the browser, so it is only
 * accepted after Meta itself confirms — through the token's granular scopes and the WABA's
 * own phone list — that this workspace's token owns it. A number connected to another
 * workspace is refused.
 */
export async function selectWhatsAppNumber(phoneNumberId: string, session?: SessionPayload | null): Promise<{ error?: string; displayPhoneNumber?: string }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  if (!/^\d{5,25}$/.test(phoneNumberId)) return { error: "That isn't a WhatsApp phone number id." };
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "WHATSAPP" } } });
  if (!row || row.status === "NOT_CONNECTED" || !row.accessToken) return { error: "WhatsApp isn't connected." };
  const settings = (row.settings ?? {}) as { wabaId?: string; availableNumbers?: Array<{ id: string; wabaId: string }> };
  const candidate = settings.availableNumbers?.find((n) => n.id === phoneNumberId);
  if (!candidate) return { error: "That number isn't one of the numbers Meta granted this workspace. Reconnect WhatsApp to refresh the list." };
  try {
    // Re-check with Meta rather than trusting what we stored earlier: access can be removed.
    if (!(await tokenOwnsWaba(row.accessToken, candidate.wabaId))) return { error: "Meta no longer grants this workspace access to that WhatsApp Business Account. Reconnect WhatsApp." };
    const phones = await listPhoneNumbers(row.accessToken, candidate.wabaId);
    const phone = phones.find((p) => p.id === phoneNumberId);
    if (!phone) return { error: "Meta no longer lists that number on this WhatsApp Business Account." };
    const elsewhere = await prisma.integration.findFirst({ where: { provider: "WHATSAPP", externalId: phone.id, businessId: { not: ctx.business.id }, status: { in: ["CONNECTED", "SYNC_ERROR", "NEEDS_ATTENTION"] } } });
    if (elsewhere) return { error: "That number is already connected to another Daythread workspace." };
    await prisma.integration.update({
      where: { id: row.id },
      data: {
        externalId: phone.id,
        externalAccount: `${phone.verified_name} · ${phone.display_phone_number}`,
        settings: { ...settings, wabaId: candidate.wabaId, phoneNumberId: phone.id, displayPhoneNumber: phone.display_phone_number, verifiedName: phone.verified_name, qualityRating: phone.quality_rating ?? null, codeVerificationStatus: phone.code_verification_status ?? null },
        lastError: null,
        lastErrorAt: null,
      },
    });
    await track("integration_connected", { businessId: ctx.business.id, properties: { provider: "WHATSAPP", change: "number" } });
    revalidatePath("/dashboard/settings");
    return { displayPhoneNumber: phone.display_phone_number };
  } catch (err) {
    await reportFailure("oauth", "WhatsApp number switch failed", { businessId: ctx.business.id, provider: "WHATSAPP", error: err });
    return { error: "Meta couldn't confirm that number just now. Nothing was changed — try again." };
  }
}
