import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { z } from "zod";
import { askCopilot } from "@/app/actions/copilot";

const schema = z.object({ question: z.string().trim().min(1).max(500) });

/** The assistant answers from the workspace's own records, or says it doesn't have enough information. Same limits as the web. */
export async function POST(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ask a question.", 400);
  try {
    return NextResponse.json({ answer: await askCopilot(parsed.data.question, session) });
  } catch {
    return jsonError("The assistant is for owners and staff.", 403);
  }
}
