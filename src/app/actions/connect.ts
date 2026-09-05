"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { signOAuthState } from "@/lib/integrations/oauthState";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { instagramConfigured, instagramAuthUrl } from "@/lib/meta/instagram";
import { whatsappConfigured, whatsappAuthUrl } from "@/lib/meta/whatsapp";
import { makeClient, discover, listCalendars as caldavCalendars } from "@/lib/caldav";
import { syncCalendarIn, readCalendarSettings, type CalendarChoice } from "@/server/calendarSync";
import { twilioConfigured, searchNumbers, provisionNumber, releaseNumber } from "@/lib/twilio";
import { smsEntitled } from "@/lib/billing";
import { track } from "@/lib/analytics";
import { reportFailure } from "@/lib/observe";
import { disconnectGoogle } from "@/app/actions/googleAuth";
import { syncCalendarNow } from "@/app/actions/calendars";
import { z } from "zod";
import type { IntegrationProvider } from "@prisma/client";

const ADMIN = ["OWNER", "ADMIN"] as const;

function guardEncryption() {
  if (process.env.NODE_ENV === "production" && !tokenCryptoConfigured()) throw new Error("Connections are paused until the deployment's encryption key is configured.");
}

/** Instagram: Meta's own authorization screen. Professional accounts only. */
export async function connectInstagram() {
  const ctx = await requireRole([...ADMIN]);
  if (!ctx) throw new Error("unauthorized");
  if (!instagramConfigured()) throw new Error("Instagram isn't configured on this deployment.");
  guardEncryption();
  await track("integration_connect_started", { businessId: ctx.business.id, properties: { provider: "INSTAGRAM" } });
  const state = await signOAuthState({ provider: "instagram", purpose: "messaging", businessId: ctx.business.id, userId: ctx.session.userId });
  redirect(instagramAuthUrl(state));
}

/** WhatsApp: Meta's Embedded Signup (Facebook Login for Business). */
export async function connectWhatsApp() {
  const ctx = await requireRole([...ADMIN]);
  if (!ctx) throw new Error("unauthorized");
  if (!whatsappConfigured()) throw new Error("WhatsApp isn't configured on this deployment.");
  guardEncryption();
  await track("integration_connect_started", { businessId: ctx.business.id, properties: { provider: "WHATSAPP" } });
  const state = await signOAuthState({ provider: "whatsapp", purpose: "messaging", businessId: ctx.business.id, userId: ctx.session.userId });
  redirect(whatsappAuthUrl(state));
}

/**
 * Apple Calendar over iCloud CalDAV. The credential is an app-specific password the user
 * generates at appleid.apple.com — Apple's supported mechanism for third-party calendar
 * clients — never their Apple ID password. It is verified by a real discovery call before
 * anything is stored, stored encrypted, and revocable from Apple's side at any time.
 */
const AppleSchema = z.object({
  appleId: z.string().trim().toLowerCase().email("Enter the email address of your Apple ID."),
  appSpecificPassword: z.string().trim().regex(/^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/i, "That isn't an app-specific password. They look like abcd-efgh-ijkl-mnop — create one at appleid.apple.com → Sign-In and Security → App-Specific Passwords."),
});

export type AppleConnectResult = { error?: string; calendars?: CalendarChoice[]; selected?: string[] };

export async function connectAppleCalendar(appleId: string, appSpecificPassword: string, session?: SessionPayload | null): Promise<AppleConnectResult> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  guardEncryption();
  const parsed = AppleSchema.safeParse({ appleId, appSpecificPassword });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  const { appleId: id, appSpecificPassword: pw } = parsed.data;
  await track("integration_connect_started", { businessId: ctx.business.id, properties: { provider: "APPLE_CALENDAR" } });
  try {
    const client = makeClient(id, pw);
    const found = await discover(client);
    const cals = await caldavCalendars({ ...client, baseUrl: found.baseUrl }, found.calendarHome);
    if (cals.length === 0) return { error: "Apple accepted the sign-in but returned no calendars. Make sure iCloud Calendar is turned on for this Apple ID." };
    const available: CalendarChoice[] = cals.map((c) => ({ id: c.href, name: c.name, readOnly: c.readOnly }));
    const prior = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "APPLE_CALENDAR" } } });
    const priorSettings = readCalendarSettings(prior ?? { settings: null });
    const keep = priorSettings.selected.filter((h) => available.some((c) => c.id === h));
    const firstWritable = available.find((c) => !c.readOnly) ?? available[0];
    const selected = keep.length ? keep : [firstWritable.id];
    const settings = { available, selected, bookingCalendar: priorSettings.bookingCalendar && selected.includes(priorSettings.bookingCalendar) ? priorSettings.bookingCalendar : selected[0], cursors: {}, baseUrl: found.baseUrl, principal: found.principal, calendarHome: found.calendarHome };
    await prisma.integration.upsert({
      where: { businessId_provider: { businessId: ctx.business.id, provider: "APPLE_CALENDAR" } },
      create: { businessId: ctx.business.id, provider: "APPLE_CALENDAR", status: "CONNECTED", externalAccount: id, externalId: found.principal, accessToken: pw, settings, lastError: null, lastErrorAt: null, wanted: false },
      update: { status: "CONNECTED", externalAccount: id, externalId: found.principal, accessToken: pw, settings, lastError: null, lastErrorAt: null, lastSyncStatus: null, syncCursor: null, wanted: false },
    });
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "APPLE_CALENDAR" } } });
    if (row) await syncCalendarIn(row);
    await track("integration_connected", { businessId: ctx.business.id, properties: { provider: "APPLE_CALENDAR" } });
    revalidatePath("/dashboard/settings");
    return { calendars: available, selected };
  } catch (err) {
    await reportFailure("oauth", "Apple Calendar connect failed", { businessId: ctx.business.id, provider: "APPLE_CALENDAR", error: err });
    await track("integration_failed", { businessId: ctx.business.id, properties: { provider: "APPLE_CALENDAR", stage: "discover" } });
    const msg = err instanceof Error ? err.message : "";
    if (/rejected the sign-in/i.test(msg)) return { error: "Apple Calendar authentication failed. Make sure you're using an Apple app-specific password, not your normal Apple ID password, and that the Apple ID is right." };
    if (/principal|calendar home/i.test(msg)) return { error: "Authentication succeeded but calendar discovery failed. Check that iCloud Calendar is enabled for this Apple ID, then try again." };
    return { error: "Couldn't reach iCloud just now. Nothing was saved — try again in a minute." };
  }
}

/** Disconnect for every provider: credentials erased, sync stopped, provider grant revoked
 * where the provider offers revocation (Google). Tenant-scoped: only this business's row. */
export async function disconnectIntegration(provider: IntegrationProvider, session?: SessionPayload | null): Promise<{ error?: string }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  if (provider === "EMAIL" || provider === "GOOGLE_CALENDAR") {
    await disconnectGoogle(provider, session);
    return {};
  }
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider } } });
  if (!row) return { error: "Nothing to disconnect." };
  await prisma.externalEvent.deleteMany({ where: { integrationId: row.id } });
  await prisma.integration.update({ where: { id: row.id }, data: { status: "NOT_CONNECTED", accessToken: null, refreshToken: null, tokenExpiresAt: null, externalAccount: null, externalId: null, scopes: null, syncCursor: null, settings: undefined, lastSyncStatus: null, lastError: null, lastErrorAt: null } });
  if (provider === "APPLE_CALENDAR") await prisma.booking.updateMany({ where: { businessId: ctx.business.id, externalCalendarProvider: "APPLE_CALENDAR" }, data: { externalEventId: null, externalCalendarProvider: null } });
  await track("integration_disconnected", { businessId: ctx.business.id, properties: { provider } });
  revalidatePath("/dashboard/settings");
  return {};
}

export async function retrySync(provider: IntegrationProvider): Promise<{ ok: boolean; error?: string }> {
  if (provider === "GOOGLE_CALENDAR" || provider === "APPLE_CALENDAR") return syncCalendarNow(provider);
  return { ok: false, error: "This integration syncs by webhook; nothing to retry." };
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
  try {
    const bought = await provisionNumber(phoneNumber, ctx.business.name);
    await prisma.business.update({ where: { id: ctx.business.id }, data: { twilioPhoneNumber: bought.phoneNumber } });
    await prisma.integration.upsert({
      where: { businessId_provider: { businessId: ctx.business.id, provider: "SMS" } },
      create: { businessId: ctx.business.id, provider: "SMS", status: "CONNECTED", externalAccount: bought.phoneNumber, externalId: bought.sid, lastSyncedAt: new Date(), lastSyncStatus: "ok", wanted: false },
      update: { status: "CONNECTED", externalAccount: bought.phoneNumber, externalId: bought.sid, lastSyncedAt: new Date(), lastSyncStatus: "ok", lastError: null, lastErrorAt: null, wanted: false },
    });
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
