import { prisma } from "@/lib/db";
import { readOpportunity, type Opportunity } from "@/lib/opportunity";

export type ColdLead = {
  leadId: string;
  conversationId: string | null;
  name: string;
  opportunity: Opportunity;
  /** What happened, from the record: when they wrote, when you replied, how long the silence has been. */
  happened: string;
  daysQuiet: number;
  estimatedValueCents: number;
};

/**
 * Leads going cold: a real person showed intent, the business replied, and they have not
 * answered for long enough that a follow-up is the right move (the attention rule
 * `follow_up_suggested`, or a follow-up the owner set that has come due). Ranked by what
 * the opportunity is worth, then by how long the silence has lasted. Everything shown is
 * read from the lead and its conversation; nothing is estimated beyond the service price
 * the lead already carries.
 */
export async function getColdLeads(businessId: string, now = new Date(), limit = 8): Promise<ColdLead[]> {
  const leads = await prisma.lead.findMany({
    where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, respondedAt: { not: null } },
    include: {
      service: { select: { name: true } },
      client: { select: { name: true, relationship: true, bookings: { where: { startAt: { gte: now }, status: { not: "CANCELED" } }, select: { id: true }, take: 1 } } },
      conversation: { select: { id: true, archived: true, category: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, createdAt: true } } } },
    },
  });
  const out: ColdLead[] = [];
  for (const l of leads) {
    if (!l.conversation || l.conversation.archived || l.conversation.category !== "PRIORITY") continue;
    const last = l.conversation.messages[0];
    const o = readOpportunity({
      category: l.conversation.category,
      relationship: l.client?.relationship ?? null,
      lead: { status: l.status, intent: l.intent, respondedAt: l.respondedAt, lastInboundAt: l.lastInboundAt, followUpAt: l.followUpAt, createdAt: l.createdAt, serviceName: l.service?.name ?? null, requestedDateText: l.requestedDateText, requestedLocation: l.requestedLocation, budgetCents: l.budgetCents, estimatedValueCents: l.estimatedValueCents },
      lastWordIsTheirs: last?.direction === "INBOUND",
      lastInboundAt: last?.direction === "INBOUND" ? last.createdAt : null,
      hasUpcomingBooking: (l.client?.bookings.length ?? 0) > 0,
      now,
    });
    const kind = o.attention?.kind;
    if (kind !== "follow_up_suggested" && kind !== "follow_up_due") continue;
    const daysQuiet = Math.max(0, Math.floor((now.getTime() - (l.respondedAt as Date).getTime()) / 86_400_000));
    const asked = l.service?.name ? `asked about ${l.service.name}${l.requestedDateText ? ` for ${l.requestedDateText}` : ""}` : l.requestedDateText ? `asked about ${l.requestedDateText}` : "wrote to you";
    out.push({
      leadId: l.id,
      conversationId: l.conversationId,
      name: l.client?.name || l.extractedName || "Unknown",
      opportunity: o,
      happened: `They ${asked}; you replied ${daysQuiet === 0 ? "today" : daysQuiet === 1 ? "yesterday" : `${daysQuiet} days ago`} and nothing has come back since.`,
      daysQuiet,
      estimatedValueCents: l.estimatedValueCents || l.budgetCents || 0,
    });
  }
  return out
    .sort((a, b) => b.estimatedValueCents - a.estimatedValueCents || b.opportunity.rank - a.opportunity.rank || b.daysQuiet - a.daysQuiet)
    .slice(0, limit);
}
