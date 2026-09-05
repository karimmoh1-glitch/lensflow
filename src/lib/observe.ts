import { prisma } from "@/lib/db";

/**
 * Lightweight failure tracking. Every OAuth, webhook, sync, delivery, billing or job
 * failure lands as an OpsEvent with a category, a safe message and ids — never a token,
 * never a message body, never a raw provider payload. The setup page shows the last 24h.
 */
export type OpsArea = "oauth" | "webhook" | "sync" | "delivery" | "billing" | "job" | "db";

const SECRET_PATTERNS = [/sk_(live|test)_[A-Za-z0-9]+/g, /whsec_[A-Za-z0-9]+/g, /ya29\.[A-Za-z0-9_-]+/g, /EAA[A-Za-z0-9]+/g, /Bearer\s+[A-Za-z0-9._-]+/gi, /refresh_token=[^&\s]+/gi, /access_token=[^&\s]+/gi];

export function scrub(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[redacted]");
  return out.slice(0, 500);
}

export async function reportFailure(area: OpsArea, message: string, opts: { businessId?: string | null; provider?: string | null; meta?: Record<string, string | number | boolean | null>; level?: "error" | "warn"; error?: unknown } = {}): Promise<void> {
  const detail = opts.error instanceof Error ? opts.error.message : typeof opts.error === "string" ? opts.error : "";
  const safe = scrub(detail ? `${message}: ${detail}` : message);
  console.error(`[${area}${opts.provider ? `:${opts.provider}` : ""}] ${safe}`);
  try {
    await prisma.opsEvent.create({ data: { area, level: opts.level ?? "error", message: safe, businessId: opts.businessId ?? null, provider: opts.provider ?? null, meta: opts.meta ?? undefined } });
  } catch {
    /* observability must never break the thing it observes */
  }
}
