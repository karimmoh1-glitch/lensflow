import { prisma } from "@/lib/db";
import { getValidAccessToken, listRecentGmailMessages } from "@/lib/google";
import { ingestInboundMessage } from "@/server/leadIngestion";
import { reportFailure } from "@/lib/observe";

export type GmailSyncResult = { ok: true; found: number; ingested: number } | { ok: false; error: string; skipped?: boolean };

/**
 * Pulls a workspace's recent Gmail into the inbox — the real, on-demand equivalent of a
 * webhook. One place for the inbox poll, the "Check for new emails" button, the Today page
 * on open, and the daily cron, so every path records the same connection state and the
 * same failure the settings page explains.
 */
export async function syncGmailForBusiness(businessId: string): Promise<GmailSyncResult> {
  const integration = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "EMAIL" } } });
  if (!integration?.refreshToken || integration.status === "NOT_CONNECTED") return { ok: false, error: "Gmail isn't connected for this business.", skipped: true };
  try {
    const accessToken = await getValidAccessToken(integration);
    const messages = await listRecentGmailMessages(accessToken, integration.lastSyncedAt ? 15 : 60);
    let ingested = 0;
    for (const m of messages) {
      const result = await ingestInboundMessage({ businessId, channel: "EMAIL", senderName: m.fromName || m.from.split("@")[0], senderHandle: m.from, body: m.body, subject: m.subject, clientEmail: m.from, providerMessageId: m.messageIdHeader || m.id, headers: m.headers, rawBody: m.rawBody });
      if (!result.duplicate) ingested += 1;
    }
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date(), lastSyncStatus: "ok", lastError: null, lastErrorAt: null, status: "CONNECTED" } });
    return { ok: true, found: messages.length, ingested };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gmail sync failed";
    const revoked = /invalid_grant|No refresh token|401/i.test(message);
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncStatus: "failed", lastError: revoked ? "Google revoked access — reconnect" : "Couldn't reach Gmail", lastErrorAt: new Date(), status: revoked ? "NEEDS_ATTENTION" : "SYNC_ERROR" } });
    await reportFailure("sync", "Gmail sync failed", { businessId, provider: "EMAIL", error: err });
    return { ok: false, error: revoked ? "Google revoked Daythread's access. Reconnect Gmail from Settings." : "Couldn't reach Gmail just now. Your messages are safe — try again in a minute." };
  }
}

/**
 * Every connected Gmail, once — for the cron, so nightly follow-ups and reminders see
 * today's mail even when nobody opened the app. Least-recently-synced first, inside a time
 * budget that fits the cron's 60-second limit; whatever doesn't fit is first in line on the
 * next run, so no workspace is starved and the run never times out mid-write.
 */
export async function syncAllGmail(opts: { limit?: number; budgetMs?: number } = {}): Promise<{ workspaces: number; ingested: number; failures: number; skipped: number }> {
  const { limit = 200, budgetMs = 40_000 } = opts;
  const started = Date.now();
  const rows = await prisma.integration.findMany({ where: { provider: "EMAIL", status: { in: ["CONNECTED", "SYNC_ERROR"] }, refreshToken: { not: null } }, select: { businessId: true }, orderBy: { lastSyncedAt: "asc" }, take: limit });
  const out = { workspaces: 0, ingested: 0, failures: 0, skipped: 0 };
  for (const r of rows) {
    if (Date.now() - started > budgetMs) { out.skipped += 1; continue; }
    out.workspaces += 1;
    const res = await syncGmailForBusiness(r.businessId);
    if (res.ok) out.ingested += res.ingested;
    else if (!res.skipped) out.failures += 1;
  }
  return out;
}
