import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/auth";
import { automationsEntitled, planLimits } from "@/lib/billing";
import { AUTOMATION_RECIPES, AUTOMATION_VARIABLES } from "@/lib/automationRecipes";
import { z } from "zod";
import { createAutomation } from "@/app/actions/automations";

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
    automations: rows.map((a) => ({ id: a.id, name: a.name, trigger: a.trigger, action: a.action, offsetHours: a.offsetHours, enabled: a.enabled, messageTemplate: a.messageTemplate })),
    recipes: AUTOMATION_RECIPES,
    variables: AUTOMATION_VARIABLES,
    recent: recent.map((r) => ({ id: r.id, name: r.automation.name, result: r.result, ranAt: r.ranAt })),
  });
}

const createSchema = z.object({ name: z.string(), trigger: z.enum(["BOOKING_CREATED", "DAYS_BEFORE_SHOOT", "SHOOT_COMPLETED", "LEAD_INACTIVE"]), action: z.enum(["SEND_CONFIRMATION", "SEND_QUESTIONNAIRE", "SEND_REMINDER", "SEND_THANK_YOU", "SEND_FOLLOW_UP"]), offsetHours: z.number().int(), messageTemplate: z.string() });
/** Creates an automation with the same validation and plan cap as the web editor. */
export async function POST(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Check the fields.", 400);
  const r = await createAutomation(parsed.data, session);
  if (r.error) return jsonError(r.error, 400);
  return NextResponse.json({ ok: true, id: r.id, paused: r.paused ?? null });
}
