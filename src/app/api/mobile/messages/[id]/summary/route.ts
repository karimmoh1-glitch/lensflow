import { NextResponse } from "next/server";
import { requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { summarizeMessage } from "@/app/actions/messages";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, STAFF_ROLES);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const result = await summarizeMessage(id, session);
  if ("error" in result && result.error) return jsonError(result.error, 429);
  return NextResponse.json(result);
}
