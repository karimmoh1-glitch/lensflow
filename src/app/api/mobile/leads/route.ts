import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileBusiness, isErrorResponse } from "@/lib/mobileApi";
import type { LeadStatus } from "@prisma/client";

const ACTIVE_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED"];

/** Inbox list — every active lead for this org, newest inbound first. Mirrors the web
 * dashboard's inbox query, scoped through the same tenant-isolated requireBusiness(). */
export async function GET(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const statuses: LeadStatus[] = statusParam ? [statusParam as LeadStatus] : ACTIVE_STATUSES;

  const leads = await prisma.lead.findMany({
    where: { businessId: ctx.business.id, status: { in: statuses } },
    include: {
      client: true,
      service: true,
      conversation: { include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } },
    },
    orderBy: { lastInboundAt: "desc" },
  });

  return NextResponse.json({
    leads: leads.map((lead) => ({
      id: lead.id,
      clientName: lead.client?.name ?? lead.extractedName ?? "Unknown",
      channel: lead.conversation?.channel ?? null,
      preview: lead.conversation?.messages[0]?.body ?? null,
      serviceName: lead.service?.name ?? null,
      status: lead.status,
      intent: lead.intent,
      score: lead.score,
      lastInboundAt: lead.lastInboundAt,
      respondedAt: lead.respondedAt,
    })),
  });
}
