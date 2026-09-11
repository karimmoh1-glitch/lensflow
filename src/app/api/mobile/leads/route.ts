import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileRole, isErrorResponse } from "@/lib/mobileApi";
import { STAFF_ROLES } from "@/lib/auth";
import type { LeadStatus } from "@prisma/client";

const ACTIVE_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED"];

/**
 * Inbox list — every active lead for this org, newest inbound first. Staff only: a CLIENT
 * has a login for their own portal and a PARTNER only sees work assigned to them, so
 * neither may read the pipeline. Mirrors the web dashboard, which redirects both away from
 * the inbox entirely.
 */
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
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
    // Capped like every other list in the app, so a long pipeline cannot stall the phone.
    take: 200,
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
