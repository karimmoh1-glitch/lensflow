import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { saveAvailability } from "@/app/actions/settings";
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const rows = await prisma.availability.findMany({ where: { businessId: ctx.business.id }, orderBy: [{ weekday: "asc" }, { startMin: "asc" }] });
  return NextResponse.json({ windows: rows.map((r) => ({ weekday: r.weekday, startMin: r.startMin, endMin: r.endMin })), timezone: ctx.business.timezone });
}
const schema = z.object({ windows: z.array(z.object({ weekday: z.number().int().min(0).max(6), startMin: z.number().int().min(0).max(1440), endMin: z.number().int().min(0).max(1440) })).max(21) });
export async function PUT(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.windows.some((w) => w.endMin <= w.startMin)) return jsonError("Each window needs a start before its end.", 400);
  try { await saveAvailability(parsed.data.windows, session); return NextResponse.json({ ok: true }); } catch (e) { return jsonError(e instanceof Error && e.message !== "unauthorized" ? e.message : "Only an owner or admin can change hours.", 403); }
}
