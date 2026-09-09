import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { sendQuestionnaire } from "@/app/actions/bookings";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  try { await sendQuestionnaire(id, session); return NextResponse.json({ ok: true }); } catch (e) { return jsonError(e instanceof Error ? e.message : "Couldn't send it", 400); }
}
