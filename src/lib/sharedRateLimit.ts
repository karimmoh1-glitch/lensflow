import { createHash } from "crypto";
import { prisma } from "@/lib/db";

/**
 * A rate limit that holds across every serverless instance and region, for the limits an
 * attacker would otherwise beat by spreading requests: password guesses against one account,
 * signups from one network. Counted from rows in the database; the key is hashed, so no
 * address or IP is stored.
 *
 * Check-then-record is not atomic, so a burst can exceed the cap by the number of requests
 * in flight at once — a handful, not the unbounded reset an in-memory bucket gives per
 * instance. A database failure refuses the attempt: these guard logins, where waiting a
 * minute is harmless and letting guesses through unmetered is not.
 */
export async function sharedRateLimit(key: string, opts: { limit: number; windowMs: number }): Promise<{ ok: boolean }> {
  const hashed = createHash("sha256").update(key).digest("hex");
  try {
    const since = new Date(Date.now() - opts.windowMs);
    const used = await prisma.rateLimitHit.count({ where: { key: hashed, createdAt: { gte: since } } });
    if (used >= opts.limit) return { ok: false };
    await prisma.rateLimitHit.create({ data: { key: hashed } });
    if (Math.random() < 0.02) {
      await prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }).catch(() => {});
    }
    return { ok: true };
  } catch (err) {
    console.error("[rateLimit] shared limit unavailable; refusing", err instanceof Error ? err.message : "unknown");
    return { ok: false };
  }
}

/** The one bucket every password check for an account draws from: web login, mobile login, invitation acceptance. */
export const accountPasswordBucket = (email: string) => sharedRateLimit(`password:${email.trim().toLowerCase()}`, { limit: 10, windowMs: 15 * 60 * 1000 });
