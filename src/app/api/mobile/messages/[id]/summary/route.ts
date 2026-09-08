import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { summarizeMessage } from "@/app/actions/messages";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const result = await summarizeMessage(id, session);
  if ("error" in result && result.error) return jsonError(result.error, 429);
  return NextResponse.json(result);
}
