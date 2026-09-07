"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { track } from "@/lib/analytics";

/**
 * "Follow up on Thursday." A date on the lead; when it arrives the person appears under
 * Needs attention with that reason. Their own message clears it (ingestion), because then
 * the reason is "waiting for your reply", which outranks it. Tenant-scoped: a lead from
 * another workspace is simply not found.
 */
export async function setFollowUp(leadId: string, at: string | null): Promise<{ error?: string; followUpAt?: string | null }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) return { error: "Please log in again." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, businessId: ctx.business.id }, select: { id: true, conversationId: true } });
  if (!lead) return { error: "That person isn't here anymore." };
  let when: Date | null = null;
  if (at !== null) {
    when = new Date(at);
    if (Number.isNaN(when.getTime())) return { error: "That date didn't make sense." };
    if (when.getTime() > Date.now() + 366 * 86400000) return { error: "Pick a date within the next year." };
  }
  await prisma.lead.update({ where: { id: lead.id }, data: { followUpAt: when } });
  if (when) {
    const prior = await prisma.analyticsEvent.count({ where: { businessId: ctx.business.id, name: { in: ["first_followup_created", "followup_created"] } } });
    await track(prior === 0 ? "first_followup_created" : "followup_created", { businessId: ctx.business.id, properties: { daysAhead: Math.max(0, Math.round((when.getTime() - Date.now()) / 86400000)) } });
  } else {
    await track("followup_cleared", { businessId: ctx.business.id });
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inbox");
  return { followUpAt: when ? when.toISOString() : null };
}
