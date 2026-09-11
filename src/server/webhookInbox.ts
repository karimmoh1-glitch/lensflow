import { prisma } from "@/lib/db";
import { scrub, reportFailure } from "@/lib/observe";
import { Prisma } from "@prisma/client";

/**
 * Every signed webhook goes through the same inbox. The provider's event id is claimed
 * before any work (a redelivery of a processed event is acknowledged and ignored); a
 * handler that throws leaves the row FAILED with the verified payload and the scrubbed
 * error, so the provider's own redelivery or the daily run can process it again. After
 * MAX_ATTEMPTS the row is a dead letter: kept, counted on the founder dashboard, never
 * retried automatically. Payloads are the provider's verified event, held only while a
 * retry is still possible; they are the tenant's own data, never analytics.
 */
export const MAX_ATTEMPTS = 5;

/**
 * How long a claim may sit unfinished before another delivery is allowed to take it over.
 * A handler that is killed mid-flight — a function timeout, an out-of-memory kill — leaves
 * its row at "received" with no catch block ever running. Without this, every later
 * redelivery of that event was answered "duplicate" and the event was lost for good: a paid
 * subscription that never activated, a booking that never arrived. Comfortably longer than
 * any handler here runs, so a genuine in-flight delivery is never duplicated.
 */
export const STALE_CLAIM_MS = 5 * 60_000;

export type WebhookRun = { status: "processed" | "duplicate" | "failed" | "dead"; error?: string };

export async function runWebhook<T>(provider: string, eventId: string, payload: T, handler: (payload: T) => Promise<void>, opts: { businessId?: string | null } = {}): Promise<WebhookRun> {
  let id: string;
  let attempts = 0;
  try {
    const row = await prisma.webhookEvent.create({ data: { provider, eventId, status: "received", businessId: opts.businessId ?? null } });
    id = row.id;
  } catch {
    const existing = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider, eventId } } });
    if (!existing) return { status: "failed", error: "claim" };
    // A provider redelivering a delivery we failed on is the retry we want. So is one whose
    // claim was taken and never finished, which is what a killed handler leaves behind.
    const stale = existing.status === "received" && Date.now() - existing.receivedAt.getTime() > STALE_CLAIM_MS;
    const retryable = existing.status === "failed" || stale;
    if (!retryable || existing.attempts >= MAX_ATTEMPTS) return { status: existing.status === "dead" ? "dead" : "duplicate" };
    id = existing.id;
    attempts = existing.attempts;
  }
  try {
    await handler(payload);
    await prisma.webhookEvent.update({ where: { id }, data: { status: "processed", processedAt: new Date(), payload: Prisma.DbNull, lastError: null, attempts: attempts + 1, ...(opts.businessId ? { businessId: opts.businessId } : {}) } });
    return { status: "processed" };
  } catch (err) {
    const error = scrub(err instanceof Error ? err.message : String(err));
    const dead = attempts + 1 >= MAX_ATTEMPTS;
    await prisma.webhookEvent.update({ where: { id }, data: { status: dead ? "dead" : "failed", attempts: attempts + 1, lastError: error, payload: dead ? Prisma.DbNull : (payload as Prisma.InputJsonValue), ...(opts.businessId ? { businessId: opts.businessId } : {}) } }).catch(() => {});
    await reportFailure("webhook", `${provider} webhook handler failed${dead ? " (dead letter)" : ""}`, { provider, businessId: opts.businessId ?? null, error: err, meta: { eventId, attempt: attempts + 1 } });
    return { status: dead ? "dead" : "failed", error };
  }
}

/** The daily run: process every failed delivery again, oldest first, inside a time budget. */
export async function retryFailedWebhooks(handlers: Record<string, (payload: unknown) => Promise<void>>, opts: { budgetMs?: number; limit?: number } = {}): Promise<{ retried: number; processed: number; dead: number }> {
  const started = Date.now();
  const out = { retried: 0, processed: 0, dead: 0 };
  // Failed deliveries, and claims that were taken and never finished. The second kind has no
  // stored payload to replay, so it can only be recovered by the provider redelivering — but
  // it is released here so that redelivery is not answered "duplicate".
  const stuck = await prisma.webhookEvent.updateMany({
    where: { status: "received", provider: { in: Object.keys(handlers) }, receivedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
    data: { status: "failed", lastError: "The handler never finished; released for the provider to redeliver." },
  });
  if (stuck.count > 0) await reportFailure("webhook", "Released webhook claims that never finished", { level: "warn", meta: { released: stuck.count } });
  const rows = await prisma.webhookEvent.findMany({ where: { status: "failed", provider: { in: Object.keys(handlers) }, payload: { not: Prisma.DbNull } }, orderBy: { receivedAt: "asc" }, take: opts.limit ?? 50 });
  for (const row of rows) {
    if (Date.now() - started > (opts.budgetMs ?? 20_000)) break;
    const handler = handlers[row.provider];
    if (!handler || row.payload === null) continue;
    out.retried++;
    const r = await runWebhook(row.provider, row.eventId, row.payload, handler, { businessId: row.businessId });
    if (r.status === "processed") out.processed++;
    if (r.status === "dead") out.dead++;
  }
  return out;
}

export async function deadLetterSummary(): Promise<Array<{ provider: string; n: number; latest: string | null }>> {
  const rows = await prisma.webhookEvent.groupBy({ by: ["provider"], where: { status: { in: ["dead", "failed"] } }, _count: { _all: true } });
  const out = [];
  for (const r of rows) {
    const last = await prisma.webhookEvent.findFirst({ where: { provider: r.provider, status: { in: ["dead", "failed"] } }, orderBy: { receivedAt: "desc" }, select: { lastError: true } });
    out.push({ provider: r.provider, n: r._count._all, latest: last?.lastError ?? null });
  }
  return out;
}
