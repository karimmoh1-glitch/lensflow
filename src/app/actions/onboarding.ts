"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { track } from "@/lib/analytics";

/**
 * Onboarding is two screens: welcome, then connect a first channel. Both are skippable —
 * finishing only marks the workspace ready and records the timezone the browser reported,
 * so message times read right from the first thread.
 */
export async function completeOnboarding(input: { timezone?: string; connected?: number } = {}) {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) redirect("/login");
  const { business } = ctx;

  let timezone: string | undefined;
  if (input.timezone) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: input.timezone });
      timezone = input.timezone;
    } catch {
      timezone = undefined;
    }
  }

  if (!business.onboardingComplete) {
    await prisma.business.update({ where: { id: business.id }, data: { onboardingComplete: true, onboardingStep: 2, ...(timezone ? { timezone } : {}) } });
    await track("onboarding_completed", { businessId: business.id, properties: { connected: input.connected ?? 0 } });
  }

  redirect("/dashboard/inbox");
}
