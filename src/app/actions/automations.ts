"use server";

import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import { requireRole } from "@/lib/auth";
import { automationsEntitled, canEnableAutomation, planLimits, PLANS, effectivePlan } from "@/lib/billing";
import { revalidatePath } from "next/cache";

/** Returns `{ error }` for expected outcomes (a plan limit) rather than throwing: a thrown
 * server-action error is a 500, and in production Next.js replaces its message with a
 * generic one — so the upgrade prompt would never reach the user. Throwing is reserved
 * for genuine failures (no session), which the client renders as a plain retry message. */
export async function toggleAutomation(id: string, enabled: boolean): Promise<{ error?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");
  // Automations are a Pro+ feature — only enforce on turning one ON. Turning one OFF
  // stays allowed regardless of plan, so a downgraded business isn't stuck unable to
  // disable something that's already running.
  if (enabled && !automationsEntitled(ctx.business)) {
    return { error: "Automations are available on the Pro plan and above. Upgrade from Billing to turn this on." };
  }
  if (enabled) {
    // Count-based allowance (Free: 3 switched on at once), decided from the database row
    // inside a transaction so two quick toggles can't both squeeze past the cap.
    const refused = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${ctx.business.id} FOR UPDATE`;
      const fresh = await tx.business.findUniqueOrThrow({ where: { id: ctx.business.id }, select: { planTier: true, billingStatus: true } });
      const on = await tx.automation.count({ where: { businessId: ctx.business.id, enabled: true, id: { not: id } } });
      if (!canEnableAutomation(fresh, on)) return { limit: planLimits(fresh).maxAutomations, plan: effectivePlan(fresh) };
      await tx.automation.updateMany({ where: { id, businessId: ctx.business.id }, data: { enabled: true } });
      return null;
    });
    if (refused) return { error: `${PLANS[refused.plan].name} includes ${refused.limit} automations switched on at once. Turn one off, or upgrade to Pro for unlimited automations.` };
  } else {
    await prisma.automation.updateMany({ where: { id, businessId: ctx.business.id }, data: { enabled: false } });
  }
  await track(enabled ? "automation_enabled" : "automation_disabled", { businessId: ctx.business.id, properties: { automationId: id } });
  revalidatePath("/dashboard/automations");
  return {};
}
