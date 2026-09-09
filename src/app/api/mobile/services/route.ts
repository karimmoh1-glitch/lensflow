import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { saveServices } from "@/app/actions/settings";
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const rows = await prisma.service.findMany({ where: { businessId: ctx.business.id, active: true }, orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ services: rows.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents, durationMins: s.durationMins })) });
}
const schema = z.object({ services: z.array(z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(80), priceCents: z.number().int().min(0).max(100_000_000), durationMins: z.number().int().min(5).max(24 * 60) })).max(50) });
export async function PUT(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Each service needs a name, a price and a duration.", 400);
  try { await saveServices(parsed.data.services, session); return NextResponse.json({ ok: true }); } catch (e) { return jsonError(e instanceof Error && e.message !== "unauthorized" ? e.message : "Only an owner or admin can change services.", 403); }
}
