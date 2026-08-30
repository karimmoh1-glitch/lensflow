import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { sendReplyAction } from "@/app/actions/inbox";
import { requireMobileBusiness, isErrorResponse, jsonError } from "@/lib/mobileApi";

const schema = z.object({ body: z.string().min(1) });

/** Sends a reply on the lead's conversation — same sendReplyAction() the web dashboard's
 * inbox uses (real channel adapter + persisted outbound Message), fed the mobile bearer
 * session. The lead lookup is scoped to the caller's own business, and sendReplyAction
 * re-verifies the conversation against that same businessId — never trusts the id alone. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("A message body is required", 400);

  const lead = await prisma.lead.findFirst({ where: { id, businessId: ctx.business.id }, select: { conversationId: true } });
  if (!lead || !lead.conversationId) return jsonError("Not found", 404);

  try {
    const result = await sendReplyAction(lead.conversationId, parsed.data.body, false, session);
    if (!result.ok) return jsonError(result.error, 502);
  } catch {
    return jsonError("Unable to send this reply", 403);
  }

  return NextResponse.json({ ok: true });
}
