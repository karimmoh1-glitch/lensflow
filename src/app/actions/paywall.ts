"use server";

import { requireBusiness } from "@/lib/auth";
import { track } from "@/lib/analytics";
import type { PaywallFeature } from "@/lib/paywall";

/**
 * Which paid feature people reach for, and which paywall they act on. Only the feature id,
 * the surface that showed it and the plan they were on — never the content of anything.
 */
export async function recordPaywallEvent(event: "paywall_shown" | "paywall_cta" | "paywall_dismissed", feature: PaywallFeature, source: string): Promise<void> {
  const ctx = await requireBusiness();
  if (!ctx) return;
  await track(event, { businessId: ctx.business.id, properties: { feature, source: source.slice(0, 60), plan: ctx.business.planTier } });
}
