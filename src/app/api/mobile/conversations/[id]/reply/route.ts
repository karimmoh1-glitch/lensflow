import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { z } from "zod";
import { sendReplyAction } from "@/app/actions/inbox";

const schema = z.object({ body: z.string().trim().min(1).max(8000), aiDrafted: z.boolean().optional() });

/** Same sendReplyAction the web composer uses: real delivery, an honest NOT_DELIVERED, the quote rule, the follow-up rule. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Write something to send.", 400);
  try {
    const result = await sendReplyAction(id, parsed.data.body, Boolean(parsed.data.aiDrafted), session);
    if (!result.ok) return jsonError(result.error, 502);
    return NextResponse.json({ ok: true, delivered: !result.simulated });
  } catch (err) {
    return jsonError(err instanceof Error && err.message !== "unauthorized" ? err.message : "This reply couldn't be sent.", 403);
  }
}
