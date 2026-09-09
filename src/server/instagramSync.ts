import { prisma } from "@/lib/db";
import { ingestInboundMessage } from "@/server/leadIngestion";
import { listInstagramConversations, listInstagramSubscriptions, subscribeInstagramWebhooks } from "@/lib/meta/instagram";
import { MetaApiError } from "@/lib/meta/common";
import { reportFailure } from "@/lib/observe";
import type { Integration } from "@prisma/client";

/**
 * Reconciliation for Instagram: webhooks are the normal path; this is the repair. It reads
 * the recent conversations from the Graph API and ingests any customer message newer than
 * the last successful sync (with a day of overlap), idempotent on Meta's message id, so a
 * webhook Meta never delivered still lands, and one it did deliver is never duplicated.
 * Bounded: twenty conversations, ten messages each, one request. A dead token flips the
 * row to "reconnect" instead of failing quietly.
 */
export type InstagramSyncResult = { ok: true; found: number; ingested: number } | { ok: false; error: string; skipped?: boolean };

const TOKEN_ERRORS = new Set([190, 102]);

export async function syncInstagramForBusiness(businessId: string, now = new Date()): Promise<InstagramSyncResult> {
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "INSTAGRAM" } } });
  if (!row?.accessToken || !row.externalId || row.status === "NOT_CONNECTED") return { ok: false, error: "Instagram isn't connected.", skipped: true };
  const since = row.lastSyncedAt ? new Date(row.lastSyncedAt.getTime() - 24 * 3600 * 1000) : new Date(now.getTime() - 30 * 86400 * 1000);
  try {
    const convos = await listInstagramConversations(row.accessToken, 20);
    let found = 0;
    let ingested = 0;
    for (const c of convos) {
      const other = c.participants.find((p) => p.id !== row.externalId);
      if (!other) continue;
      for (const m of [...c.messages].reverse()) {
        if (m.from?.id === row.externalId || !m.message) continue;
        if (new Date(m.created_time) < since) continue;
        found++;
        const r = await ingestInboundMessage({ businessId, channel: "INSTAGRAM", senderName: other.username ? `@${other.username}` : `Instagram user ${other.id.slice(-4)}`, senderHandle: other.id, body: m.message, providerMessageId: m.id });
        if (!r.duplicate) ingested++;
      }
    }
    await prisma.integration.update({ where: { id: row.id }, data: { lastSyncedAt: now, lastSyncStatus: "ok", lastError: null, lastErrorAt: null, ...(row.status === "SYNC_ERROR" ? { status: "CONNECTED" } : {}) } });
    return { ok: true, found, ingested };
  } catch (err) {
    const dead = err instanceof MetaApiError && (err.status === 401 || (err.code !== null && TOKEN_ERRORS.has(err.code)));
    await prisma.integration.update({ where: { id: row.id }, data: { lastSyncStatus: "failed", lastError: dead ? "Instagram's token no longer works — reconnect" : "Couldn't reach Instagram", lastErrorAt: now, status: dead ? "NEEDS_ATTENTION" : row.status === "CONNECTED" ? "SYNC_ERROR" : row.status } });
    await reportFailure("sync", "Instagram reconciliation failed", { businessId, provider: "INSTAGRAM", error: err });
    return { ok: false, error: dead ? "Instagram's token no longer works. Reconnect it from Settings → Channels." : "Couldn't reach Instagram just now. Your messages are safe — try again in a minute." };
  }
}

/**
 * Is Meta still going to deliver this account's DMs? Reads the subscription and, when the
 * `messages` field is missing, subscribes again once; the outcome is recorded on the row so
 * the channel card can say "connected but not receiving" instead of "connected".
 */
export async function checkInstagramSubscription(row: Integration): Promise<{ subscribed: boolean; repaired: boolean }> {
  if (!row.accessToken || !row.externalId) return { subscribed: false, repaired: false };
  const settings = (row.settings as Record<string, unknown> | null) ?? {};
  try {
    let { subscribed } = await listInstagramSubscriptions(row.accessToken, row.externalId);
    let repaired = false;
    if (!subscribed) {
      await subscribeInstagramWebhooks(row.accessToken, row.externalId).catch(() => {});
      subscribed = (await listInstagramSubscriptions(row.accessToken, row.externalId)).subscribed;
      repaired = subscribed;
    }
    await prisma.integration.update({ where: { id: row.id }, data: { settings: { ...settings, webhooksSubscribed: subscribed, webhooksCheckedAt: new Date().toISOString() }, ...(subscribed ? {} : { lastError: "Connected, but Instagram isn't delivering DMs to Daythread — reconnect to re-subscribe.", lastErrorAt: new Date(), lastSyncStatus: "failed" }) } });
    return { subscribed, repaired };
  } catch (err) {
    await reportFailure("sync", "Instagram subscription check failed", { businessId: row.businessId, provider: "INSTAGRAM", error: err, level: "warn" });
    return { subscribed: Boolean(settings.webhooksSubscribed), repaired: false };
  }
}
