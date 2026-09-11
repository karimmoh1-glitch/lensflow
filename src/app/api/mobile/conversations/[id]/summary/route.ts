import { NextResponse } from "next/server";
import { requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { summarizeConversation } from "@/app/actions/conversations";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, STAFF_ROLES);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const url = new URL(req.url);
  const result = await summarizeConversation(id, { force: url.searchParams.get("force") === "1" }, session);
  if (result.error) return jsonError(result.error, 429);
  return NextResponse.json(result.summary);
}
