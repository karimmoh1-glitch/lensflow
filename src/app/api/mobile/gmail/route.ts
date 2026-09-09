import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { syncGmailNow } from "@/app/actions/googleAuth";
/** Pull Gmail now — the same throttled sync the web's inbox runs on open. */
export async function POST(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const r = await syncGmailNow(session);
  return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: r.error === "unauthorized" ? 403 : 200 });
}
