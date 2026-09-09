import { prisma } from "@/lib/db";
import { syncGmailForBusiness } from "@/server/gmailSync";
import { syncInstagramForBusiness } from "@/server/instagramSync";

/**
 * "Check for messages": reconcile every connected channel with its provider. Not the normal
 * path — webhooks and the live stream are — but the repair when one was missed. Each
 * provider's sync is idempotent and cursor-aware; a provider that only pushes (WhatsApp,
 * SMS) has nothing to pull and says so.
 */
export type ReconcileResult = { provider: "EMAIL" | "INSTAGRAM"; ok: boolean; found?: number; ingested?: number; error?: string; skipped?: boolean };
const MIN_GAP_MS = 30_000;

export async function reconcileBusiness(businessId: string, opts: { force?: boolean } = {}): Promise<{ results: ReconcileResult[]; ingested: number }> {
  const rows = await prisma.integration.findMany({ where: { businessId, provider: { in: ["EMAIL", "INSTAGRAM"] }, status: { not: "NOT_CONNECTED" } }, select: { provider: true, lastSyncedAt: true, lastSyncStatus: true, refreshToken: true, accessToken: true } });
  const results: ReconcileResult[] = [];
  for (const row of rows) {
    const provider = row.provider as "EMAIL" | "INSTAGRAM";
    const recent = row.lastSyncedAt && row.lastSyncStatus === "ok" && Date.now() - row.lastSyncedAt.getTime() < MIN_GAP_MS;
    if (recent && !opts.force) { results.push({ provider, ok: true, found: 0, ingested: 0, skipped: true }); continue; }
    if (provider === "EMAIL") {
      if (!row.refreshToken) continue;
      const r = await syncGmailForBusiness(businessId);
      results.push(r.ok ? { provider, ok: true, found: r.found, ingested: r.ingested } : { provider, ok: false, error: r.error, skipped: r.skipped });
    } else {
      if (!row.accessToken) continue;
      const r = await syncInstagramForBusiness(businessId);
      results.push(r.ok ? { provider, ok: true, found: r.found, ingested: r.ingested } : { provider, ok: false, error: r.error, skipped: r.skipped });
    }
  }
  return { results, ingested: results.reduce((n, r) => n + (r.ingested ?? 0), 0) };
}
