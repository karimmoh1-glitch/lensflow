import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import { answersSchema, derivePersonalization, type OnboardingAnswers, type Personalization, type PlanKey } from "@/lib/personalization";
import type { IntegrationProvider } from "@prisma/client";

/**
 * Where the onboarding answers land, and what they change. Saving a profile does exactly
 * four things, and "Building your Daythread" lists exactly those four: the profile row;
 * the workspace's priority order (Business.priorities); the channels they said they use,
 * marked wanted on their Integration rows so Settings and the shell point at them; and the
 * recommended plan, stored so the subscription page can repeat it. Nothing is connected,
 * nothing is charged, no data is invented.
 */
export async function savePersonalization(businessId: string, answers: OnboardingAnswers, opts: { selectedPlan?: PlanKey | null; anonymousId?: string | null; source: "signup" | "google" | "mobile" | "settings" }): Promise<Personalization> {
  const p = derivePersonalization(answers);
  const a = p.answers;
  const data = {
    userType: a.userType, workCategory: a.workCategory, workDetail: a.workDetail?.trim() || null, businessStatus: a.businessStatus, teamSize: a.teamSize ?? null,
    channels: a.channels, painPoints: a.painPoints, desiredFeatures: a.desiredFeatures, currentTools: a.currentTools, bookings: a.bookings, teamUsage: a.teamUsage,
    recommendedPlan: p.recommendedPlan, ...(opts.selectedPlan !== undefined ? { selectedPlan: opts.selectedPlan } : {}),
  };
  const existing = await prisma.onboardingProfile.findUnique({ where: { businessId }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    await tx.onboardingProfile.upsert({ where: { businessId }, create: { businessId, ...data }, update: data });
    await tx.business.update({ where: { id: businessId }, data: { priorities: p.priorities } });
    for (const provider of p.connectProviders) {
      await tx.integration.upsert({
        where: { businessId_provider: { businessId, provider: provider as IntegrationProvider } },
        create: { businessId, provider: provider as IntegrationProvider, wanted: true },
        update: { wanted: true },
      });
    }
  });
  await track(existing ? "personalization_updated" : "personalization_created", {
    businessId, anonymousId: opts.anonymousId ?? undefined,
    properties: { source: opts.source, recommendedPlan: p.recommendedPlan, selectedPlan: opts.selectedPlan ?? null, priorities: p.priorities, channelCount: p.channelCount, businessStatus: a.businessStatus, userType: a.userType, workCategory: a.workCategory, usesBookings: p.usesBookings, usesTeam: p.usesTeam },
  });
  return p;
}

export type StoredPersonalization = Personalization & { selectedPlan: PlanKey | null; createdAt: Date };

/** The saved profile, re-derived with the current rules (so a rule fix applies to everyone). */
export async function getPersonalization(businessId: string): Promise<StoredPersonalization | null> {
  const row = await prisma.onboardingProfile.findUnique({ where: { businessId } });
  if (!row) return null;
  const parsed = answersSchema.safeParse({
    userType: row.userType, workCategory: row.workCategory, workDetail: row.workDetail ?? undefined, businessStatus: row.businessStatus, teamSize: row.teamSize ?? undefined,
    channels: row.channels, painPoints: row.painPoints, desiredFeatures: row.desiredFeatures, currentTools: row.currentTools, bookings: row.bookings, teamUsage: row.teamUsage,
  });
  if (!parsed.success) return null;
  return { ...derivePersonalization(parsed.data), selectedPlan: row.selectedPlan, createdAt: row.createdAt };
}

/** Parses what a signup form or the Google sign-in cookie carried. Invalid → null, and the account is created all the same. */
export function parseAnswers(raw: unknown): OnboardingAnswers | null {
  if (typeof raw !== "string" || raw.length > 4000) return null;
  try {
    const parsed = answersSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
