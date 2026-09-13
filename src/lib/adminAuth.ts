import { timingSafeEqual, createHash } from "crypto";
import { clientIpFrom } from "@/lib/rateLimit";
import { sharedRateLimit } from "@/lib/sharedRateLimit";

/**
 * Constant-time comparison for the shared admin secret. Hashing both sides to a fixed
 * length first means timingSafeEqual never throws on a length mismatch (which itself
 * would leak the real secret's length via a try/catch) and never short-circuits early on
 * a byte-by-byte `!==` compare.
 */
function safeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/** Verifies the `x-seed-secret` header against SEED_SECRET. Returns "unconfigured" if the
 * env var isn't set (caller should 501), "rate-limited" if this IP has guessed wrong too
 * many times recently (caller should 429), "unauthorized" if it doesn't match (401), or
 * "ok". Centralized so every admin-only route uses the same constant-time, rate-limited
 * check — these routes guard cross-tenant destructive operations behind a single static
 * secret. The budget lives in the shared table, not in one instance's memory: a fleet of
 * serverless instances must not each hand a guesser a fresh window. */
export async function verifySeedSecret(req: Request): Promise<"ok" | "unauthorized" | "unconfigured" | "rate-limited"> {
  const secret = process.env.SEED_SECRET;
  if (!secret) return "unconfigured";

  const ip = clientIpFrom(req.headers);
  if (!(await sharedRateLimit(`admin-auth:${ip}`, { limit: 10, windowMs: 10 * 60 * 1000 })).ok) return "rate-limited";

  const provided = req.headers.get("x-seed-secret");
  if (!provided || !safeEqual(provided, secret)) return "unauthorized";
  return "ok";
}
