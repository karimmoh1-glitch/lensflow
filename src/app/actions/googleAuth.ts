"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { googleOAuthConfigured, getGoogleAuthUrl, getValidAccessToken, listRecentGmailMessages, revokeGoogleToken } from "@/lib/google";
import { signOAuthState } from "@/lib/integrations/oauthState";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { ingestInboundMessage } from "@/server/leadIngestion";
import { reportFailure } from "@/lib/observe";
import { track } from "@/lib/analytics";
import { syncCalendarIn } from "@/server/calendarSync";
import { listCalendars, calendarToken } from "@/lib/googleCalendar";

/** Kicks off Google's real consent screen for Gmail (default) or Google Calendar. Never a
 * toggle. Only reachable when Daythread's Google OAuth client is configured, and only when
 * tokens can be stored encrypted. */
export async function connectGoogle(purpose: "gmail" | "calendar" = "gmail") {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");
  if (!googleOAuthConfigured()) throw new Error("Google sign-in isn't configured on this deployment.");
  if (process.env.NODE_ENV === "production" && !tokenCryptoConfigured()) throw new Error("Connections are paused until the deployment's encryption key is configured.");
  await track("integration_connect_started", { businessId: ctx.business.id, properties: { provider: purpose === "calendar" ? "GOOGLE_CALENDAR" : "EMAIL" } });
  const state = await signOAuthState({ provider: "google", purpose, businessId: ctx.business.id, userId: ctx.session.userId });
  redirect(await getGoogleAuthUrl(state, purpose));
}

/** Disconnect really stops access: the grant is revoked at Google, the tokens are erased,
 * the mirror events are forgotten, and no sync will run again for this row. */
export async function disconnectGoogle(provider: "EMAIL" | "GOOGLE_CALENDAR" = "EMAIL") {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider } } });
  if (row?.refreshToken) await revokeGoogleToken(row.refreshToken);
  else if (row?.accessToken) await revokeGoogleToken(row.accessToken);
  if (row) {
    await prisma.externalEvent.deleteMany({ where: { integrationId: row.id } });
    await prisma.integration.update({ where: { id: row.id }, data: { status: "NOT_CONNECTED", accessToken: null, refreshToken: null, tokenExpiresAt: null, externalAccount: null, externalId: null, scopes: null, syncCursor: null, settings: undefined, lastSyncStatus: null, lastError: null, lastErrorAt: null } });
    if (provider === "GOOGLE_CALENDAR") await prisma.booking.updateMany({ where: { businessId: ctx.business.id, externalCalendarProvider: "GOOGLE_CALENDAR" }, data: { externalEventId: null, externalCalendarProvider: null } });
  }
  await track("integration_disconnected", { businessId: ctx.business.id, properties: { provider } });
  revalidatePath("/dashboard/settings");
}

export type SyncGmailResult = { ok: true; found: number; ingested: number } | { ok: false; error: string };

/** The real, on-demand equivalent of a webhook for Gmail: pulls recent inbox messages now
 * and routes each new one through the same ingestion every channel uses. A revoked grant
 * flips the row to NEEDS_ATTENTION instead of failing silently forever. */
export async function syncGmailNow(): Promise<SyncGmailResult> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) return { ok: false, error: "unauthorized" };
  const integration = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "EMAIL" } } });
  if (!integration?.refreshToken || integration.status === "NOT_CONNECTED") return { ok: false, error: "Gmail isn't connected for this business." };

  try {
    const accessToken = await getValidAccessToken(integration);
    const messages = await listRecentGmailMessages(accessToken, integration.lastSyncedAt ? 15 : 60);
    let ingested = 0;
    for (const m of messages) {
      const result = await ingestInboundMessage({ businessId: ctx.business.id, channel: "EMAIL", senderName: m.fromName || m.from.split("@")[0], senderHandle: m.from, body: m.body, subject: m.subject, clientEmail: m.from, providerMessageId: m.messageIdHeader || m.id, headers: m.headers, rawBody: m.rawBody });
      if (!result.duplicate) ingested += 1;
    }
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date(), lastSyncStatus: "ok", lastError: null, lastErrorAt: null, status: "CONNECTED" } });
    revalidatePath("/dashboard/inbox");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    return { ok: true, found: messages.length, ingested };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gmail sync failed";
    const revoked = /invalid_grant|No refresh token|401/i.test(message);
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncStatus: "failed", lastError: revoked ? "Google revoked access — reconnect" : "Couldn't reach Gmail", lastErrorAt: new Date(), status: revoked ? "NEEDS_ATTENTION" : "SYNC_ERROR" } });
    await reportFailure("sync", "Gmail sync failed", { businessId: ctx.business.id, provider: "EMAIL", error: err });
    return { ok: false, error: revoked ? "Google revoked Daythread's access. Reconnect Gmail from Settings." : "Couldn't reach Gmail just now. Your messages are safe — try again in a minute." };
  }
}

export async function syncGoogleCalendarNow(): Promise<{ ok: boolean; error?: string; upserted?: number }> {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) return { ok: false, error: "unauthorized" };
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "GOOGLE_CALENDAR" } } });
  if (!row || row.status === "NOT_CONNECTED") return { ok: false, error: "Google Calendar isn't connected." };
  const r = await syncCalendarIn(row);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/calendar");
  return r.ok ? { ok: true, upserted: r.upserted } : { ok: false, error: r.error };
}

export async function listGoogleCalendarsForSettings(): Promise<{ calendars: Array<{ id: string; name: string; primary: boolean }>; selected: string | null; error?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) return { calendars: [], selected: null, error: "unauthorized" };
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "GOOGLE_CALENDAR" } } });
  if (!row || row.status === "NOT_CONNECTED") return { calendars: [], selected: null };
  try {
    const cals = await listCalendars(await calendarToken(row));
    return { calendars: cals.map((c) => ({ id: c.id, name: c.summary, primary: Boolean(c.primary) })), selected: (row.settings as { calendarId?: string } | null)?.calendarId ?? null };
  } catch (err) {
    return { calendars: [], selected: null, error: err instanceof Error ? err.message : "Couldn't list calendars" };
  }
}

export async function selectGoogleCalendar(calendarId: string, calendarName: string): Promise<{ error?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "GOOGLE_CALENDAR" } } });
  if (!row) return { error: "Google Calendar isn't connected." };
  // A different calendar means a fresh sync position and a fresh set of busy blocks.
  await prisma.externalEvent.deleteMany({ where: { integrationId: row.id, bookingId: null } });
  await prisma.integration.update({ where: { id: row.id }, data: { settings: { ...((row.settings as object) ?? {}), calendarId, calendarName }, syncCursor: null } });
  const fresh = await prisma.integration.findUnique({ where: { id: row.id } });
  if (fresh) await syncCalendarIn(fresh);
  revalidatePath("/dashboard/settings");
  return {};
}
