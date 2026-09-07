import { prisma } from "@/lib/db";

/**
 * Rate limiting that survives serverless: the count is the number of events of `name` a
 * business recorded inside the window, read from the database, so every instance and
 * region sees the same number. Used where a limit is a product rule (Copilot questions,
 * agent sends) rather than a per-instance abuse brake — for those, lib/rateLimit.ts stays.
 *
 * Check-then-record is not atomic; a burst can exceed the cap by the number of concurrent
 * requests, never by more. That is acceptable for spend caps counted in the tens per hour.
 */
export async function dbRateLimit(businessId: string, name: string, opts: { limit: number; windowMs: number }): Promise<{ ok: boolean; used: number; limit: number }> {
  const since = new Date(Date.now() - opts.windowMs);
  const used = await prisma.analyticsEvent.count({ where: { businessId, name, createdAt: { gte: since } } });
  return { ok: used < opts.limit, used, limit: opts.limit };
}
