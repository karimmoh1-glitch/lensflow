import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/auth";
import { teamEntitled, planLimits } from "@/lib/billing";

export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const members = await prisma.orgMembership.findMany({ where: { businessId: ctx.business.id, status: "ACTIVE", role: { not: "CLIENT" } }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } });
  const seats = planLimits(ctx.business).maxTeamSeats;
  return NextResponse.json({
    entitled: teamEntitled(ctx.business),
    seats: Number.isFinite(seats) ? seats : null,
    you: ctx.membership.id,
    members: members.map((m) => ({ id: m.id, name: m.user.name, email: ctx.role === "OWNER" || ctx.role === "ADMIN" ? m.user.email : null, role: m.role, since: m.createdAt })),
  });
}
