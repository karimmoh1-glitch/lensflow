import { headers } from "next/headers";

/**
 * In-memory, per-instance rate limiting. Serverless functions don't share this state
 * across concurrent instances or regions, so it's not a hard cap at real scale — but it
 * meaningfully blocks the overwhelmingly common case (a single script hammering one
 * endpoint) without adding a Redis dependency this app doesn't otherwise need. Swap the
 * bucket store for a distributed one (Upstash/Redis) if abuse from spread-out instances
 * becomes a real problem.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(key: string, opts: { limit: number; windowMs: number }): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= opts.limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }
  existing.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

/** Best-effort caller IP from standard proxy headers (Vercel sets x-forwarded-for). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("Too many requests. Please try again shortly.");
    this.name = "RateLimitError";
  }
}

/** Throws RateLimitError when the limit for `key` is exceeded — for use at the top of a
 * server action, after computing a key from getClientIp() and/or another identifier. */
export async function enforceRateLimit(key: string, opts: { limit: number; windowMs: number }) {
  const result = rateLimit(key, opts);
  if (!result.ok) throw new RateLimitError(result.retryAfterSeconds);
}
