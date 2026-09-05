import { prisma } from "@/lib/db";
import { syncCalendarIn } from "@/server/calendarSync";
import { refreshInstagramToken } from "@/lib/meta/instagram";
import { reportFailure } from "@/lib/observe";

/**
 * The daily sweep for connected integrations: pull calendar changes, refresh Instagram's
 * 60-day tokens before they expire, and flag anything whose credentials have gone. Only
 * rows that are actually connected — a disconnected integration is never touched again.
 */
export async function runIntegrationMaintenance(): Promise<{ calendars: number; calendarFailures: number; instagramRefreshed: number; flagged: number }> {
  const out = { calendars: 0, calendarFailures: 0, instagramRefreshed: 0, flagged: 0 };
  const calendars = await prisma.integration.findMany({ where: { provider: { in: ["GOOGLE_CALENDAR", "APPLE_CALENDAR"] }, status: { in: ["CONNECTED", "SYNC_ERROR"] } } });
  for (const row of calendars) {
    const r = await syncCalendarIn(row);
    if (r.ok) out.calendars++;
    else out.calendarFailures++;
  }
  const instagram = await prisma.integration.findMany({ where: { provider: "INSTAGRAM", status: { in: ["CONNECTED", "SYNC_ERROR"] } } });
  for (const row of instagram) {
    if (!row.accessToken) continue;
    const expiresSoon = !row.tokenExpiresAt || row.tokenExpiresAt.getTime() < Date.now() + 7 * 86400000;
    const oldEnough = !row.updatedAt || Date.now() - row.updatedAt.getTime() > 86400000; // Meta refreshes tokens ≥ 24h old
    if (!expiresSoon || !oldEnough) continue;
    try {
      const r = await refreshInstagramToken(row.accessToken);
      await prisma.integration.update({ where: { id: row.id }, data: { accessToken: r.accessToken, tokenExpiresAt: r.expiresAt } });
      out.instagramRefreshed++;
    } catch (err) {
      await prisma.integration.update({ where: { id: row.id }, data: { status: "NEEDS_ATTENTION", lastError: "Instagram token could not be refreshed — reconnect", lastErrorAt: new Date() } });
      await reportFailure("sync", "Instagram token refresh failed", { businessId: row.businessId, provider: "INSTAGRAM", error: err });
      out.flagged++;
    }
  }
  const expired = await prisma.integration.updateMany({ where: { provider: "WHATSAPP", status: "CONNECTED", tokenExpiresAt: { lt: new Date() } }, data: { status: "NEEDS_ATTENTION", lastError: "WhatsApp access expired — reconnect", lastErrorAt: new Date() } });
  out.flagged += expired.count;
  return out;
}
