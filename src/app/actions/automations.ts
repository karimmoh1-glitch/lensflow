"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function toggleAutomation(id: string, enabled: boolean) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");
  await prisma.automation.updateMany({ where: { id, businessId: ctx.business.id }, data: { enabled } });
  revalidatePath("/dashboard/automations");
}
