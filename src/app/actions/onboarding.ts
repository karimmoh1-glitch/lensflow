"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { answersSchema, planSchema, type Personalization } from "@/lib/personalization";
import { savePersonalization } from "@/server/personalization";
import { AUTOMATION_RECIPES, STARTER_RECIPES } from "@/lib/automationRecipes";
import { createAutomation } from "@/app/actions/automations";

function validTimezone(tz: string | undefined): string | undefined {
  if (!tz) return undefined;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

/**
 * Marks the workspace ready and records the timezone the browser reported, so message
 * times read right from the first thread. Idempotent; no redirect, so the caller can go
 * on to Stripe or to the inbox as it likes.
 */
export async function markOnboardingDone(input: { timezone?: string; connected?: number; via?: "today" | "connect" | "checkout" } = {}, session?: SessionPayload | null): Promise<{ ok: boolean }> {
  const ctx = await requireRole(["OWNER", "ADMIN"], session);
  if (!ctx) return { ok: false };
  const { business } = ctx;
  const timezone = validTimezone(input.timezone);
  if (!business.onboardingComplete) {
    await prisma.business.update({ where: { id: business.id }, data: { onboardingComplete: true, onboardingStep: 2, ...(timezone ? { timezone } : {}) } });
    await track("onboarding_completed", { businessId: business.id, properties: { connected: input.connected ?? 0, via: input.via ?? "today" } });
    await track("onboarding_to_product", { businessId: business.id, properties: { via: input.via ?? "today" } });
  }
  return { ok: true };
}

/** Onboarding's last click: the workspace is ready, open Today, where the setup continues. */
export async function completeOnboarding(input: { timezone?: string; connected?: number } = {}, session?: SessionPayload | null) {
  const res = await markOnboardingDone({ ...input, via: "today" }, session);
  if (!res.ok) redirect("/login");
  redirect("/dashboard");
}

/**
 * Onboarding's automation step: switches on the chosen starter recipes through the same
 * `createAutomation` the Automations page uses, so plan limits, duplicate checks and
 * tenant scoping are the ones already tested. A recipe the workspace already has is
 * counted as on, not copied.
 */
export async function turnOnStarterAutomations(keys: unknown, session?: SessionPayload | null): Promise<{ ok: true; created: number; existing: number; paused: string | null } | { ok: false; error: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN"], session);
  if (!ctx) return { ok: false, error: "Only an owner or admin can set this up." };
  const wanted = Array.isArray(keys) ? STARTER_RECIPES.filter((k) => keys.includes(k)) : [];
  let created = 0;
  let existing = 0;
  let paused: string | null = null;
  for (const key of wanted) {
    const recipe = AUTOMATION_RECIPES.find((r) => r.key === key)!;
    const twin = await prisma.automation.findFirst({ where: { businessId: ctx.business.id, trigger: recipe.input.trigger, action: recipe.input.action, offsetHours: recipe.input.offsetHours }, select: { id: true } });
    if (twin) { existing++; continue; }
    const result = await createAutomation(recipe.input, session);
    if (result.error) return { ok: false, error: result.error };
    created++;
    if (result.paused) paused = result.paused;
  }
  return { ok: true, created, existing, paused };
}

/**
 * "How you work" under Settings → Profile: the same answers, changed later. Re-derives
 * the priorities, the wanted channels and the recommendation exactly as signup did.
 */
export async function updatePersonalization(input: unknown): Promise<{ ok: true; recommendedPlan: Personalization["recommendedPlan"]; priorities: Personalization["priorities"] } | { ok: false; error: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) return { ok: false, error: "Only an owner or admin can change this." };
  const parsed = answersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some answers weren't recognised. Reload and try again." };
  const p = await savePersonalization(ctx.business.id, parsed.data, { source: "settings" });
  return { ok: true, recommendedPlan: p.recommendedPlan, priorities: p.priorities };
}

/** The plan chosen on the welcome screen — a preference on the profile, never a charge. */
export async function notePlanChoice(plan: unknown): Promise<void> {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) return;
  const parsed = planSchema.safeParse(plan);
  if (!parsed.success) return;
  await prisma.onboardingProfile.updateMany({ where: { businessId: ctx.business.id }, data: { selectedPlan: parsed.data } });
  await track("recommended_plan_selected", { businessId: ctx.business.id, properties: { selectedPlan: parsed.data, source: "onboarding" } });
}
