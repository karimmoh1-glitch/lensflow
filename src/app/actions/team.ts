"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * Activates/deactivates a team member's access — never deletes them, so their history
 * (assigned bookings, notes, audit trail) stays intact. A deactivated membership is
 * filtered out of getUserMemberships(), so it's a real, enforced block on login/access,
 * not just a hidden UI row.
 */
export async function setMembershipStatus(membershipId: string, active: boolean) {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");

  const membership = await prisma.orgMembership.findFirst({ where: { id: membershipId, businessId: ctx.business.id } });
  if (!membership) throw new Error("not found");
  if (membership.role === "OWNER") throw new Error("The owner can't be deactivated.");
  if (membership.userId === ctx.session.userId) throw new Error("You can't deactivate yourself.");

  await prisma.orgMembership.update({ where: { id: membershipId }, data: { status: active ? "ACTIVE" : "SUSPENDED" } });

  revalidatePath("/dashboard/team");
}

/**
 * Owner-controlled toggle for a partner's inbox scope. Off by default: a partner sees
 * only conversations tied to clients from bookings assigned to them. On: they see every
 * business conversation. Never automatic — the owner explicitly grants it per partner.
 */
export async function setPartnerConversationAccess(membershipId: string, canViewAll: boolean) {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");

  const membership = await prisma.orgMembership.findFirst({ where: { id: membershipId, businessId: ctx.business.id } });
  if (!membership) throw new Error("not found");
  if (membership.role !== "PARTNER") throw new Error("Only partners have a conversation-access setting.");

  await prisma.orgMembership.update({ where: { id: membershipId }, data: { canViewAllConversations: canViewAll } });

  revalidatePath("/dashboard/team");
}
