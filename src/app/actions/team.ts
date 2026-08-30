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
