import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { updateBusinessProfile } from "@/app/actions/settings";
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const b = ctx.business;
  return NextResponse.json({ name: b.name, handle: b.handle, bio: b.bio ?? "", timezone: b.timezone, bufferMinutes: b.bufferMinutes, bookingLeadHours: b.bookingLeadHours, bookingUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://daythread.org"}/book/${b.handle}`, canEdit: ctx.role === "OWNER" || ctx.role === "ADMIN" });
}
const schema = z.object({ name: z.string().trim().min(1).max(80), bio: z.string().trim().max(600), timezone: z.string().min(1).max(64), bufferMinutes: z.number().int().min(0).max(240), bookingLeadHours: z.number().int().min(0).max(24 * 30) });
export async function PUT(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Check the fields.", 400);
  try { await updateBusinessProfile(parsed.data, session); return NextResponse.json({ ok: true }); } catch (e) { return jsonError(e instanceof Error && e.message !== "unauthorized" ? e.message : "Only an owner or admin can change this.", 403); }
}
