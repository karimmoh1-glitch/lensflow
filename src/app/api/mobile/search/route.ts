import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { universalSearch } from "@/app/actions/search";
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 120);
  return NextResponse.json(await universalSearch(q, session));
}
