import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/auth";
import { teamEntitled, planLimits } from "@/lib/billing";

export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const admin = ctx.role === "OWNER" || ctx.role === "ADMIN";
  const [members, invitations, requests] = await Promise.all([
    prisma.orgMembership.findMany({ where: { businessId: ctx.business.id, role: { not: "CLIENT" } }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    admin ? prisma.invitation.findMany({ where: { businessId: ctx.business.id, role: { in: ["ADMIN", "PHOTOGRAPHER", "PARTNER"] }, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 50 }) : Promise.resolve([]),
    admin ? prisma.joinRequest.findMany({ where: { businessId: ctx.business.id, status: "PENDING" }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" }, take: 50 }) : Promise.resolve([]),
  ]);
  const seats = planLimits(ctx.business).maxTeamSeats;
  return NextResponse.json({
    entitled: teamEntitled(ctx.business),
    seats: Number.isFinite(seats) ? seats : null,
    you: ctx.membership.id,
    canManage: admin,
    members: members.map((m) => ({ id: m.id, name: m.user.name, email: admin ? m.user.email : null, role: m.role, status: m.status, since: m.createdAt, canViewAllConversations: m.canViewAllConversations })),
    invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, createdAt: i.createdAt })),
    requests: requests.map((r) => ({ id: r.id, name: r.user.name, email: r.user.email, createdAt: r.createdAt })),
  });
}
