"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { automationsEntitled } from "@/lib/billing";
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
  await prisma.automation.updateMany({ where: { id, businessId: ctx.business.id }, data: { enabled } });
  revalidatePath("/dashboard/automations");
  return {};
}
