import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { updateBusinessMemory } from "@/app/actions/settings";
import { readBusinessMemory } from "@/lib/businessMemory";
import { STAFF_ROLES } from "@/lib/auth";

export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  return NextResponse.json({ memory: readBusinessMemory(ctx.business.memory), canEdit: ctx.role === "OWNER" || ctx.role === "ADMIN" });
}

export async function PUT(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const body = await req.json().catch(() => null);
  try {
    const r = await updateBusinessMemory(body, session);
    if (r.error) return jsonError(r.error, 400);
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError("Only an owner or admin can change this.", 403);
  }
}
