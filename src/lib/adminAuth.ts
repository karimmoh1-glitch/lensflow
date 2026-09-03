import { timingSafeEqual, createHash } from "crypto";
import { rateLimit } from "@/lib/rateLimit";

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
 * secret, so unlimited guessing attempts is a real risk worth closing even though the
 * secret itself is long and random. */
export function verifySeedSecret(req: Request): "ok" | "unauthorized" | "unconfigured" | "rate-limited" {
  const secret = process.env.SEED_SECRET;
  if (!secret) return "unconfigured";

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  if (!rateLimit(`admin-auth:${ip}`, { limit: 10, windowMs: 10 * 60 * 1000 }).ok) return "rate-limited";

  const provided = req.headers.get("x-seed-secret");
  if (!provided || !safeEqual(provided, secret)) return "unauthorized";
  return "ok";
}
