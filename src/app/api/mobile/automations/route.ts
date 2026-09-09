import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/auth";
import { automationsEntitled, planLimits } from "@/lib/billing";

export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const [rows, recent] = await Promise.all([
    prisma.automation.findMany({ where: { businessId: ctx.business.id }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] }),
    prisma.automationExecution.findMany({ where: { businessId: ctx.business.id }, orderBy: { ranAt: "desc" }, take: 8, include: { automation: { select: { name: true } } } }),
  ]);
  const limit = planLimits(ctx.business).maxAutomations;
  return NextResponse.json({
    entitled: automationsEntitled(ctx.business),
    limit: Number.isFinite(limit) ? limit : null,
    automations: rows.map((a) => ({ id: a.id, name: a.name, trigger: a.trigger, action: a.action, offsetHours: a.offsetHours, enabled: a.enabled })),
    recent: recent.map((r) => ({ id: r.id, name: r.automation.name, result: r.result, ranAt: r.ranAt })),
  });
}
