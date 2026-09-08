import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { readToday } from "@/server/mobileRead";
import { STAFF_ROLES } from "@/lib/auth";

/** Today: what happened while you were away, what to do next (the same engine the web dashboard reads), what's on. */
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  return NextResponse.json(await readToday(ctx.business.id, ctx.membership.id, ctx.business.timezone));
}
