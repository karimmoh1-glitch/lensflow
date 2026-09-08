import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { getDayAgenda } from "@/server/dayAgenda";
import { STAFF_ROLES } from "@/lib/auth";

/** One day's agenda in the business's timezone: bookings, busy time from connected calendars, open windows. */
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(new URL(req.url).searchParams.get("date") ?? "");
  if (!m) return jsonError("date must be YYYY-MM-DD", 400);
  const agenda = await getDayAgenda(ctx.business.id, { year: Number(m[1]), month: Number(m[2]), date: Number(m[3]) });
  return NextResponse.json(agenda);
}
