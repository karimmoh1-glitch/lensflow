import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { generateDraftAction } from "@/app/actions/inbox";
import { requireMobileBusiness, isErrorResponse, jsonError } from "@/lib/mobileApi";

/** AI-drafts a reply grounded in the real conversation + business services/pricing — same
 * generateDraftAction() (and its deterministic no-API-key fallback) the web dashboard uses.
 * Returns the draft text only; the client must explicitly send it via /reply to become an
 * outbound message — nothing is sent automatically here. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;

  const lead = await prisma.lead.findFirst({ where: { id, businessId: ctx.business.id }, select: { conversationId: true } });
  if (!lead || !lead.conversationId) return jsonError("Not found", 404);

  try {
    const draft = await generateDraftAction(lead.conversationId, session);
    return NextResponse.json({ draft });
  } catch {
    return jsonError("Unable to generate a draft", 500);
  }
}
