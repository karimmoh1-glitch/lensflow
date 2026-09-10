import { prisma } from "@/lib/db";
import { ingestInboundMessage } from "@/server/leadIngestion";
import { reportFailure } from "@/lib/observe";
import { microsoftToken, listInboxDelta, isStaleDelta, type GraphMessage } from "@/lib/microsoft";
import { normalizeEmailContent } from "@/lib/emailNormalize";
import { OAuthError } from "@/lib/integrations/oauth";

/**
 * Outlook, the same shape as Gmail: pull what changed in the inbox since the stored delta
 * link and route every new message through the one ingestion path. No delta link (first
 * run, or Graph declared it stale) means a bounded window since the last sync. Drafts,
 * the mailbox's own sent mail, and removals are skipped; nothing here logs a body.
 */
export type OutlookSyncResult = { ok: true; found: number; ingested: number } | { ok: false; error: string; skipped?: boolean };

const WINDOW_DAYS = 7;

export async function syncOutlookForBusiness(businessId: string): Promise<OutlookSyncResult> {
  const integration = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "MICROSOFT_OUTLOOK" } } });
  if (!integration?.refreshToken || integration.status === "NOT_CONNECTED") return { ok: false, error: "Outlook isn't connected for this business.", skipped: true };
  const self = (integration.externalAccount ?? "").toLowerCase();
  try {
    const accessToken = await microsoftToken(integration);
    const since = integration.lastSyncedAt ?? new Date(Date.now() - WINDOW_DAYS * 86_400_000);
    let page;
    try {
      page = await listInboxDelta(accessToken, { deltaLink: integration.syncCursor, since: integration.syncCursor ? null : since });
    } catch (err) {
      if (!isStaleDelta(err)) throw err;
      page = await listInboxDelta(accessToken, { deltaLink: null, since });
    }
    let ingested = 0;
    let found = 0;
    for (const m of page.messages) {
      if (!isInbound(m, self)) continue;
      found++;
      const from = m.from?.emailAddress?.address?.toLowerCase();
      if (!from) continue;
      const body = m.body?.contentType?.toLowerCase() === "html" ? normalizeEmailContent({ html: m.body?.content ?? "" }) : normalizeEmailContent({ text: m.body?.content ?? m.bodyPreview ?? "" });
      const result = await ingestInboundMessage({
        businessId,
        channel: "EMAIL",
        senderName: m.from?.emailAddress?.name || from.split("@")[0],
        senderHandle: from,
        body,
        subject: m.subject ?? undefined,
        clientEmail: from,
        providerMessageId: m.internetMessageId || m.id,
        headers: { replyTo: m.replyTo?.[0]?.emailAddress?.address ?? null, messageId: m.internetMessageId ?? null },
        rawBody: m.body?.content ?? undefined,
      });
      if (!result.duplicate) ingested++;
    }
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date(), lastSyncStatus: "ok", lastError: null, lastErrorAt: null, status: "CONNECTED", syncCursor: page.deltaLink ?? integration.syncCursor } });
    return { ok: true, found, ingested };
  } catch (err) {
    const revoked = err instanceof OAuthError ? err.revoked : /invalid_grant|No refresh token|401/i.test(err instanceof Error ? err.message : "");
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncStatus: "failed", lastError: revoked ? "Microsoft revoked access — reconnect" : "Couldn't reach Outlook", lastErrorAt: new Date(), status: revoked ? "NEEDS_ATTENTION" : "SYNC_ERROR" } });
    await reportFailure("sync", "Outlook sync failed", { businessId, provider: "MICROSOFT_OUTLOOK", error: err });
    return { ok: false, error: revoked ? "Microsoft revoked Daythread's access. Reconnect Outlook from Settings." : "Couldn't reach Outlook just now. Your messages are safe — try again in a minute." };
  }
}

export function isInbound(m: GraphMessage, selfAddress: string): boolean {
  if (m["@removed"] || m.isDraft) return false;
  const from = m.from?.emailAddress?.address?.toLowerCase();
  if (!from) return false;
  return from !== selfAddress;
}

/** Every connected Outlook, least recently synced first, inside a time budget (cron). */
export async function syncAllOutlook(opts: { budgetMs?: number; limit?: number } = {}): Promise<{ workspaces: number; ingested: number; failures: number }> {
  const started = Date.now();
  const out = { workspaces: 0, ingested: 0, failures: 0 };
  const rows = await prisma.integration.findMany({ where: { provider: "MICROSOFT_OUTLOOK", status: { in: ["CONNECTED", "SYNC_ERROR"] } }, orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } }, take: opts.limit ?? 50, select: { businessId: true } });
  for (const row of rows) {
    if (Date.now() - started > (opts.budgetMs ?? 20_000)) break;
    out.workspaces++;
    const r = await syncOutlookForBusiness(row.businessId);
    if (r.ok) out.ingested += r.ingested;
    else if (!r.skipped) out.failures++;
  }
  return out;
}
