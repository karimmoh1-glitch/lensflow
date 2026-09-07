"use server";

import { track } from "@/lib/analytics";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Anonymous landing-page events: a view, and a click on a call to action. Keyed by a random
 * id the browser keeps in session storage — no cookie, no fingerprint, no IP stored —
 * so drop-off from landing to signup can be measured without knowing who anyone is.
 */
export async function recordLandingEvent(name: "landing_view" | "landing_cta", anonymousId: string, source?: string): Promise<void> {
  if (!/^[a-z0-9]{8,40}$/i.test(anonymousId)) return;
  const ip = await getClientIp();
  if (!rateLimit(`landing:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 }).ok) return;
  await track(name, { anonymousId, properties: source ? { source: source.slice(0, 40) } : undefined });
}
