import { prisma } from "@/lib/db";
import { ingestInboundMessage } from "@/server/leadIngestion";
import { listInstagramConversations, listInstagramSubscriptions, subscribeInstagramWebhooks, instagramProfile, instagramIdentity, instagramSelfIds } from "@/lib/meta/instagram";
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

/**
 * One-time identity repair for connections made before the professional account id was
 * stored (they hold the app-scoped id in externalId, so Meta's webhooks — addressed by the
 * professional id — never matched). Asks Meta, with the row's own token, who the token
 * belongs to; requires the username to agree with what was connected; then moves the
 * professional id into externalId and keeps the app-scoped id alongside. Idempotent, never
 * creates a row, never touches the token, refuses to collide with another workspace.
 */
export async function resolveInstagramIdentity(row: Integration): Promise<{ repaired: boolean; professionalId: string | null; reason?: string }> {
  const settings = (row.settings as Record<string, unknown> | null) ?? {};
  if (typeof settings.professionalAccountId === "string" && settings.professionalAccountId === row.externalId) return { repaired: false, professionalId: row.externalId };
  if (!row.accessToken) return { repaired: false, professionalId: row.externalId, reason: "no token" };
  try {
    const profile = await instagramProfile(row.accessToken);
    const identity = instagramIdentity(profile);
    const knownName = (typeof settings.username === "string" ? settings.username : row.externalAccount?.replace(/^@/, "") ?? "").toLowerCase();
    if (knownName && profile.username.toLowerCase() !== knownName) {
      await reportFailure("sync", "Instagram identity repair refused: username changed", { businessId: row.businessId, provider: "INSTAGRAM", level: "warn" });
      return { repaired: false, professionalId: row.externalId, reason: "username mismatch" };
    }
    const taken = await prisma.integration.findFirst({ where: { provider: "INSTAGRAM", externalId: identity.professionalId, id: { not: row.id } }, select: { id: true } });
    if (taken) {
      await reportFailure("sync", "Instagram identity repair refused: professional id already held by another connection", { businessId: row.businessId, provider: "INSTAGRAM" });
      return { repaired: false, professionalId: row.externalId, reason: "id in use" };
    }
    await prisma.integration.update({ where: { id: row.id }, data: { externalId: identity.professionalId, settings: { ...settings, instagramUserId: identity.professionalId, professionalAccountId: identity.professionalId, appScopedUserId: identity.appScopedId, username: profile.username, identityResolvedAt: new Date().toISOString() } } });
    return { repaired: identity.professionalId !== row.externalId, professionalId: identity.professionalId };
  } catch (err) {
    await reportFailure("sync", "Instagram identity repair failed", { businessId: row.businessId, provider: "INSTAGRAM", error: err, level: "warn" });
    return { repaired: false, professionalId: row.externalId, reason: "meta error" };
  }
}

const TOKEN_ERRORS = new Set([190, 102]);

export async function syncInstagramForBusiness(businessId: string, now = new Date()): Promise<InstagramSyncResult> {
  let row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "INSTAGRAM" } } });
  if (!row?.accessToken || !row.externalId || row.status === "NOT_CONNECTED") return { ok: false, error: "Instagram isn't connected.", skipped: true };
  const repaired = await resolveInstagramIdentity(row);
  if (repaired.repaired) row = (await prisma.integration.findUnique({ where: { id: row.id } })) ?? row;
  const token = row.accessToken;
  if (!token || !row.externalId) return { ok: false, error: "Instagram isn't connected.", skipped: true };
  const selfIds = instagramSelfIds(row);
  const since = row.lastSyncedAt ? new Date(row.lastSyncedAt.getTime() - 24 * 3600 * 1000) : new Date(now.getTime() - 30 * 86400 * 1000);
  try {
    const convos = await listInstagramConversations(token, 20);
    let found = 0;
    let ingested = 0;
    for (const c of convos) {
      const other = c.participants.find((p) => !selfIds.has(p.id));
      if (!other) continue;
      for (const m of [...c.messages].reverse()) {
        // Direction from Meta's sender identity only: anything we sent — under either of our ids — is never inbound.
        if (!m.from?.id || selfIds.has(m.from.id) || !m.message) continue;
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
export async function checkInstagramSubscription(input: Integration): Promise<{ subscribed: boolean; repaired: boolean }> {
  // The subscription is read and, if needed, made against the professional account id.
  const fixed = await resolveInstagramIdentity(input);
  const row = fixed.repaired ? (await prisma.integration.findUnique({ where: { id: input.id } })) ?? input : input;
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
