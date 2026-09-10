import { prisma } from "@/lib/db";
import { syncCalendarIn } from "@/server/calendarSync";
import { refreshInstagramToken } from "@/lib/meta/instagram";
import { checkInstagramSubscription, syncInstagramForBusiness } from "@/server/instagramSync";
import { reportFailure } from "@/lib/observe";
import { notifyBusiness, noticePath } from "@/server/notify";
import { PROVIDERS, isRegisteredProvider } from "@/lib/integrations/registry";

/**
 * The daily sweep for connected integrations: pull calendar changes, refresh Instagram's
 * 60-day tokens before they expire, and flag anything whose credentials have gone. Only
 * rows that are actually connected — a disconnected integration is never touched again.
 */
/** Operational rows have a shelf life: failures older than 90 days and AI call records older
 * than 180 days are removed by the daily run, so the tables never grow without bound. Product
 * analytics (the funnel) are kept. */
export const OPS_EVENT_RETENTION_DAYS = 90;
export const AI_CALL_RETENTION_DAYS = 180;

export async function pruneOperationalRows(now = new Date()): Promise<{ opsEvents: number; aiCalls: number }> {
  const ops = await prisma.opsEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - OPS_EVENT_RETENTION_DAYS * 86_400_000) } } });
  const ai = await prisma.analyticsEvent.deleteMany({ where: { name: { in: ["ai_call", "ai_blocked"] }, createdAt: { lt: new Date(now.getTime() - AI_CALL_RETENTION_DAYS * 86_400_000) } } });
  return { opsEvents: ops.count, aiCalls: ai.count };
}

export async function runIntegrationMaintenance(): Promise<{ calendars: number; calendarFailures: number; instagramRefreshed: number; flagged: number; notified: number; pruned: { opsEvents: number; aiCalls: number } }> {
  const out = { calendars: 0, calendarFailures: 0, instagramRefreshed: 0, flagged: 0, notified: 0, pruned: { opsEvents: 0, aiCalls: 0 } };
  out.pruned = await pruneOperationalRows().catch((err) => { void reportFailure("job", "Retention prune failed", { error: err }); return { opsEvents: 0, aiCalls: 0 }; });
  const calendars = await prisma.integration.findMany({ where: { provider: { in: ["GOOGLE_CALENDAR", "APPLE_CALENDAR", "MICROSOFT_CALENDAR"] }, status: { in: ["CONNECTED", "SYNC_ERROR"] } } });
  for (const row of calendars) {
    const r = await syncCalendarIn(row);
    if (r.ok) out.calendars++;
    else out.calendarFailures++;
  }
  const instagram = await prisma.integration.findMany({ where: { provider: "INSTAGRAM", status: { in: ["CONNECTED", "SYNC_ERROR"] } } });
  for (const row of instagram) {
    if (!row.accessToken) continue;
    // Is Meta still delivering? And did anything slip past the webhook since yesterday?
    await checkInstagramSubscription(row);
    await syncInstagramForBusiness(row.businessId);
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
  out.notified = await notifyNeedsAttention();
  return out;
}

/**
 * A connection that stopped working is told to the business once — in the app, on the
 * phone, in Slack — instead of waiting to be noticed on the settings page. "Once" is kept
 * on the row (settings.attentionNotifiedAt for this lastErrorAt), so a daily run never nags.
 */
export async function notifyNeedsAttention(): Promise<number> {
  const rows = await prisma.integration.findMany({ where: { status: "NEEDS_ATTENTION" } });
  let n = 0;
  for (const row of rows) {
    const settings = (row.settings ?? {}) as { attentionNotifiedAt?: string };
    const since = row.lastErrorAt?.toISOString() ?? "unknown";
    if (settings.attentionNotifiedAt === since) continue;
    if (!isRegisteredProvider(row.provider)) continue;
    const name = PROVIDERS[row.provider].name;
    await notifyBusiness(row.businessId, { kind: "integration", title: `${name} needs attention`, body: row.lastError ?? `Your ${name} connection stopped working. Reconnect it from Settings.`, path: noticePath.settings() });
    await prisma.integration.update({ where: { id: row.id }, data: { settings: { ...settings, attentionNotifiedAt: since } } });
    n++;
  }
  return n;
}
