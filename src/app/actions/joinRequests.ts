"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole, hashPassword, verifyPassword, setSessionCookie } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/** Public, unauthenticated search used by the "Join a business" signup path. Businesses
 * are private — this returns only enough to let someone confirm they found the right
 * one (name, handle, type), never client lists, revenue, or anything else. */
export async function searchBusinesses(query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.business.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, handle: true, businessType: true },
    take: 5,
    orderBy: { name: "asc" },
  });
}

const requestJoinSchema = z.object({
  name: z.string().min(1, "Full name is required").optional(),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export type RequestJoinState = { error?: string; submitted?: boolean };

/**
 * Creates (or reuses) the requester's account and files a pending JoinRequest against
 * the chosen business. This never grants membership — the owner/admin must accept it,
 * and acceptance always lands the requester as a CLIENT, never a partner or staff role.
 */
export async function requestToJoin(businessId: string, formData: FormData): Promise<RequestJoinState> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } });
  if (!business) return { error: "That business couldn't be found." };

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email } });

  let userId: string;

  if (existingUser) {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1, "Password is required") }).safeParse({
      email,
      password: formData.get("password"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    if (!(await verifyPassword(parsed.data.password, existingUser.passwordHash))) {
      return { error: "That email already has a LensFlow account, but the password is incorrect." };
    }
    userId = existingUser.id;
  } else {
    const parsed = requestJoinSchema.safeParse({
      name: formData.get("name"),
      email,
      password: formData.get("password"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    if (!parsed.data.name) return { error: "Full name is required" };
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({ data: { name: parsed.data.name, email, passwordHash } });
    userId = user.id;
  }

  const existingMembership = await prisma.orgMembership.findUnique({
    where: { userId_businessId: { userId, businessId } },
  });
  if (existingMembership) return { error: "You're already a member of this business." };

  const existingRequest = await prisma.joinRequest.findUnique({
    where: { userId_businessId: { userId, businessId } },
  });
  if (existingRequest) {
    if (existingRequest.status === "PENDING") return { error: "You already have a pending request to join this business." };
    if (existingRequest.status === "DECLINED") {
      await prisma.joinRequest.update({ where: { id: existingRequest.id }, data: { status: "PENDING", decidedAt: null } });
      return { submitted: true };
    }
  } else {
    await prisma.joinRequest.create({ data: { businessId, userId, status: "PENDING" } });
  }

  return { submitted: true };
}

export async function listJoinRequests() {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) return [];
  return prisma.joinRequest.findMany({
    where: { businessId: ctx.business.id, status: "PENDING" },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function respondToJoinRequest(id: string, accept: boolean) {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
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
