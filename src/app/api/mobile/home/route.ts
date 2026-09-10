import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileRole, isErrorResponse } from "@/lib/mobileApi";
import { getTodayBrief } from "@/server/dashboardData";
import { STAFF_ROLES } from "@/lib/auth";

export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const { business } = ctx;

  const [newLeadsCount, brief] = await Promise.all([
    prisma.lead.count({ where: { businessId: business.id, status: "NEW" } }),
    getTodayBrief(business.id),
  ]);

  return NextResponse.json({
    businessName: business.name,
    userName: ctx.user.name,
    newLeadsCount,
    todaysShoots: brief.todaysBookings.map((b) => ({
      id: b.id,
      clientName: b.client.name,
      serviceName: b.service.name,
      startAt: b.startAt,
      location: b.location,
    })),
    warmLeadsCount: brief.leads.warm.length,
    needsReplyCount: brief.leads.needsResponse.length,
  });
}
