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
import { syncCalendarIn } from "@/server/calendarSync";
import { twilioConfigured, searchNumbers, provisionNumber, releaseNumber } from "@/lib/twilio";
import { smsEntitled } from "@/lib/billing";
import { track } from "@/lib/analytics";
import { reportFailure } from "@/lib/observe";
import { disconnectGoogle, syncGoogleCalendarNow } from "@/app/actions/googleAuth";
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
export async function connectAppleCalendar(appleId: string, appSpecificPassword: string, session?: SessionPayload | null): Promise<{ error?: string; calendars?: Array<{ href: string; name: string }> }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  guardEncryption();
  const id = appleId.trim().toLowerCase();
  const pw = appSpecificPassword.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id)) return { error: "Enter the email address of your Apple ID." };
  if (!/^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/i.test(pw)) return { error: "That doesn't look like an app-specific password (they look like abcd-efgh-ijkl-mnop). Generate one at appleid.apple.com → Sign-In and Security → App-Specific Passwords." };
  await track("integration_connect_started", { businessId: ctx.business.id, properties: { provider: "APPLE_CALENDAR" } });
  try {
    const client = makeClient(id, pw);
    const found = await discover(client);
    const calendars = (await caldavCalendars({ ...client, baseUrl: found.baseUrl }, found.calendarHome)).filter((c) => !c.readOnly);
    if (calendars.length === 0) return { error: "Apple accepted the sign-in but returned no writable calendars." };
    const first = calendars[0];
    await prisma.integration.upsert({
      where: { businessId_provider: { businessId: ctx.business.id, provider: "APPLE_CALENDAR" } },
      create: { businessId: ctx.business.id, provider: "APPLE_CALENDAR", status: "CONNECTED", externalAccount: id, externalId: found.principal, accessToken: pw, settings: { baseUrl: found.baseUrl, principal: found.principal, calendarHome: found.calendarHome, calendarHref: first.href, calendarName: first.name }, lastError: null, lastErrorAt: null, wanted: false },
      update: { status: "CONNECTED", externalAccount: id, externalId: found.principal, accessToken: pw, settings: { baseUrl: found.baseUrl, principal: found.principal, calendarHome: found.calendarHome, calendarHref: first.href, calendarName: first.name }, lastError: null, lastErrorAt: null, lastSyncStatus: null, syncCursor: null, wanted: false },
    });
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "APPLE_CALENDAR" } } });
    if (row) await syncCalendarIn(row);
    await track("integration_connected", { businessId: ctx.business.id, properties: { provider: "APPLE_CALENDAR" } });
    revalidatePath("/dashboard/settings");
    return { calendars: calendars.map((c) => ({ href: c.href, name: c.name })) };
  } catch (err) {
    await reportFailure("oauth", "Apple Calendar connect failed", { businessId: ctx.business.id, provider: "APPLE_CALENDAR", error: err });
    await track("integration_failed", { businessId: ctx.business.id, properties: { provider: "APPLE_CALENDAR", stage: "discover" } });
    const msg = err instanceof Error ? err.message : "";
    return { error: /rejected the sign-in/i.test(msg) ? "Apple rejected the sign-in. Check the Apple ID and generate a fresh app-specific password." : "Couldn't reach iCloud just now. Nothing was saved — try again in a minute." };
  }
}

export async function listAppleCalendarsForSettings(): Promise<{ calendars: Array<{ href: string; name: string }>; selected: string | null; error?: string }> {
  const ctx = await requireRole([...ADMIN]);
  if (!ctx) return { calendars: [], selected: null, error: "unauthorized" };
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "APPLE_CALENDAR" } } });
  if (!row || row.status === "NOT_CONNECTED" || !row.accessToken || !row.externalAccount) return { calendars: [], selected: null };
  const settings = (row.settings as { baseUrl?: string; calendarHome?: string; calendarHref?: string } | null) ?? {};
  try {
    const client = makeClient(row.externalAccount, row.accessToken, settings.baseUrl);
    const cals = await caldavCalendars(client, settings.calendarHome ?? "/");
    return { calendars: cals.filter((c) => !c.readOnly).map((c) => ({ href: c.href, name: c.name })), selected: settings.calendarHref ?? null };
  } catch (err) {
    return { calendars: [], selected: settings.calendarHref ?? null, error: err instanceof Error ? err.message : "Couldn't list calendars" };
  }
}

export async function selectAppleCalendar(href: string, name: string): Promise<{ error?: string }> {
  const ctx = await requireRole([...ADMIN]);
  if (!ctx) throw new Error("unauthorized");
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "APPLE_CALENDAR" } } });
  if (!row) return { error: "Apple Calendar isn't connected." };
  await prisma.externalEvent.deleteMany({ where: { integrationId: row.id, bookingId: null } });
  await prisma.integration.update({ where: { id: row.id }, data: { settings: { ...((row.settings as object) ?? {}), calendarHref: href, calendarName: name }, syncCursor: null } });
  const fresh = await prisma.integration.findUnique({ where: { id: row.id } });
  if (fresh) await syncCalendarIn(fresh);
  revalidatePath("/dashboard/settings");
  return {};
}

/** Disconnect for every provider: credentials erased, sync stopped, provider grant revoked
 * where the provider offers revocation (Google). Tenant-scoped: only this business's row. */
export async function disconnectIntegration(provider: IntegrationProvider, session?: SessionPayload | null): Promise<{ error?: string }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  if (provider === "EMAIL" || provider === "GOOGLE_CALENDAR") {
    await disconnectGoogle(provider);
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
  const ctx = await requireRole([...ADMIN]);
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (provider === "GOOGLE_CALENDAR") return syncGoogleCalendarNow();
  if (provider === "APPLE_CALENDAR") {
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider } } });
    if (!row || row.status === "NOT_CONNECTED") return { ok: false, error: "Apple Calendar isn't connected." };
    const r = await syncCalendarIn(row);
    revalidatePath("/dashboard/settings");
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
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
