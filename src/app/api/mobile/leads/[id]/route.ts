import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileBusiness, isErrorResponse, jsonError } from "@/lib/mobileApi";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, businessId: ctx.business.id },
    include: {
      client: true,
      service: true,
      conversation: { include: { messages: { orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!lead) return jsonError("Not found", 404);

  return NextResponse.json({
    id: lead.id,
    clientId: lead.clientId,
    clientName: lead.client?.name ?? lead.extractedName ?? "Unknown",
    clientEmail: lead.client?.email ?? null,
    clientPhone: lead.client?.phone ?? null,
    channel: lead.conversation?.channel ?? null,
    status: lead.status,
    intent: lead.intent,
    score: lead.score,
    scoreReasons: lead.scoreReasons,
    service: lead.service ? { id: lead.service.id, name: lead.service.name, priceCents: lead.service.priceCents, durationMins: lead.service.durationMins } : null,
    requestedDateText: lead.requestedDateText,
    conversationId: lead.conversationId,
    messages: lead.conversation?.messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      createdAt: m.createdAt,
    })) ?? [],
  });
}
