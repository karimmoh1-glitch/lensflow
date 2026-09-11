import { NextResponse } from "next/server";
import { requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { generateDraftAction } from "@/app/actions/inbox";
import { isDraftMode } from "@/lib/draftModes";

const schema = z.object({ mode: z.string().optional() });

/** A draft in one of the intents, grounded in the owner's notes and the price list; the rules fallback when there is no model. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, STAFF_ROLES);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse((await req.json().catch(() => ({}))) ?? {});
  const mode = parsed.success && parsed.data.mode && isDraftMode(parsed.data.mode) ? parsed.data.mode : "reply";
  const result = await generateDraftAction(id, session, mode);
  if ("error" in result && result.error) return jsonError(result.error, 429);
  return NextResponse.json(result);
}
