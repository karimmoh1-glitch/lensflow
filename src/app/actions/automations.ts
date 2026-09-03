"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { automationsEntitled } from "@/lib/billing";
import { revalidatePath } from "next/cache";

export async function toggleAutomation(id: string, enabled: boolean) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");
  // Automations are a Pro+ feature — only enforce on turning one ON. Turning one OFF
  // stays allowed regardless of plan, so a downgraded business isn't stuck unable to
  // disable something that's already running.
  if (enabled && !automationsEntitled(ctx.business)) {
    throw new Error("Automations are available on the Pro plan and above. Upgrade from Billing to turn this on.");
  }
  await prisma.automation.updateMany({ where: { id, businessId: ctx.business.id }, data: { enabled } });
  revalidatePath("/dashboard/automations");
}
