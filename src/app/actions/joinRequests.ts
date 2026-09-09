"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole, hashPassword, verifyPassword, setSessionCookie, type SessionPayload } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// The self-serve "search a business and request to join" path was removed: it was
// unauthenticated, unthrottled, and had no caller. Joining happens by invitation only.

export async function listJoinRequests(session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN"], session);
  if (!ctx) return [];
  return prisma.joinRequest.findMany({
    where: { businessId: ctx.business.id, status: "PENDING" },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function respondToJoinRequest(id: string, accept: boolean, session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN"], session);
  if (!ctx) throw new Error("unauthorized");

  const joinRequest = await prisma.joinRequest.findFirst({
    where: { id, businessId: ctx.business.id, status: "PENDING" },
    include: { user: true },
  });
  if (!joinRequest) throw new Error("not found");

  if (!accept) {
    await prisma.joinRequest.update({ where: { id }, data: { status: "DECLINED", decidedAt: new Date() } });
    revalidatePath("/dashboard/team");
    return;
  }

  await prisma.$transaction(async (tx) => {
    let client = await tx.client.findFirst({ where: { businessId: ctx.business.id, userId: joinRequest.userId } });
    if (!client) {
      client = await tx.client.create({
        data: { businessId: ctx.business.id, name: joinRequest.user.name, email: joinRequest.user.email, userId: joinRequest.userId },
      });
    }
    await tx.orgMembership.create({ data: { userId: joinRequest.userId, businessId: ctx.business.id, role: "CLIENT" } });
    await tx.joinRequest.update({ where: { id }, data: { status: "ACCEPTED", decidedAt: new Date() } });
    await tx.auditLog.create({
      data: { businessId: ctx.business.id, actorId: ctx.session.userId, action: "joinRequest.accepted", targetType: "user", targetId: joinRequest.userId },
    });
  });

  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/clients");
}

/** The only path from CLIENT to elevated access — always explicit, always owner/admin
 * initiated. Never automatic, per the standing rule that join requests land as clients. */
export async function promoteToPartner(membershipId: string) {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");

  const membership = await prisma.orgMembership.findFirst({ where: { id: membershipId, businessId: ctx.business.id } });
  if (!membership) throw new Error("not found");
  if (membership.role !== "CLIENT") throw new Error("Only clients can be promoted to partner.");

  await prisma.orgMembership.update({ where: { id: membershipId }, data: { role: "PARTNER" } });
  await prisma.auditLog.create({
    data: { businessId: ctx.business.id, actorId: ctx.session.userId, action: "member.promotedToPartner", targetType: "membership", targetId: membershipId },
  });

  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/clients");
}
