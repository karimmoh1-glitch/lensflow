"use server";

import { z } from "zod";
import { track } from "@/lib/analytics";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * The onboarding funnel before an account exists. Keyed by the same kind of random
 * per-visit id as the landing beacon. Only step names, option keys and plan keys are
 * accepted — never free text, never an email or a name.
 */
const schema = z.object({
  name: z.enum(["onboarding_started", "onboarding_question_answered", "onboarding_skipped", "recommended_plan_shown", "recommended_plan_selected", "personalization_completed"]),
  anonymousId: z.string().regex(/^[a-z0-9]{8,40}$/i),
  properties: z.object({
    step: z.string().regex(/^[a-z_]{1,32}$/).optional(),
    values: z.array(z.string().regex(/^[a-z0-9_]{1,32}$/)).max(12).optional(),
    count: z.number().int().min(0).max(50).optional(),
    recommendedPlan: z.enum(["FREE", "PRO", "BUSINESS"]).optional(),
    selectedPlan: z.enum(["FREE", "PRO", "BUSINESS"]).optional(),
    source: z.string().regex(/^[a-z0-9_-]{1,32}$/).optional(),
    seconds: z.number().int().min(0).max(36000).optional(),
  }).strict().optional(),
});

export async function recordOnboardingEvent(input: z.input<typeof schema>): Promise<void> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return;
  const ip = await getClientIp();
  if (!rateLimit(`onboarding:${ip}`, { limit: 120, windowMs: 10 * 60 * 1000 }).ok) return;
  await track(parsed.data.name, { anonymousId: parsed.data.anonymousId, properties: parsed.data.properties });
}
