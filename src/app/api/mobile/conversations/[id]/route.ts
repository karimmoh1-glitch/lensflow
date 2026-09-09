import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { readThread } from "@/server/mobileRead";
import { STAFF_ROLES } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const { id } = await params;
  const thread = await readThread(ctx.business.id, id, ctx.business.timezone);
  if (!thread) return jsonError("Not found", 404);
  return NextResponse.json(thread);
}
