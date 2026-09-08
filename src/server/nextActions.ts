import { prisma } from "@/lib/db";
import { getAttention } from "@/server/attention";
import { firstName } from "@/lib/utils";
import { readValue, headlineFor, stageFor, isAtRisk, rankNextActions, moneyAtRisk, type NextAction, type MoneyAtRisk } from "@/lib/nextAction";

export type NextActionsRead = { actions: NextAction[]; atRisk: MoneyAtRisk; generatedAt: Date };

/**
 * What the owner should do next, from the record: the attention rules decide who is on
 * the list, the lead carries the money (a quote that went out, a budget they named, or the
 * service's price, labelled as such), and the order is replies → confirmations →
 * follow-ups. One read, shared by Today, the assistant and the agent. Tenant-scoped at
 * every query.
 */
export async function getNextActions(businessId: string, now = new Date(), timezone = "America/New_York"): Promise<NextActionsRead> {
  const rows = await getAttention(businessId, now, timezone);
  const leadIds = rows.map((r) => r.leadId).filter((x): x is string => Boolean(x));
  const bookingIds = rows.map((r) => r.bookingId).filter((x): x is string => Boolean(x));
  const [leads, bookings] = await Promise.all([
    leadIds.length ? prisma.lead.findMany({ where: { id: { in: leadIds }, businessId }, select: { id: true, status: true, clientId: true, quotedCents: true, quotedAt: true, budgetCents: true, estimatedValueCents: true, requestedDateText: true, service: { select: { name: true, priceCents: true } }, conversation: { select: { channel: true } } } }) : Promise.resolve([]),
    bookingIds.length ? prisma.booking.findMany({ where: { id: { in: bookingIds }, businessId }, select: { id: true, clientId: true, conversationId: true, startAt: true, location: true, totalCents: true, service: { select: { name: true } }, conversation: { select: { channel: true } } } }) : Promise.resolve([]),
  ]);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const bookingById = new Map(bookings.map((b) => [b.id, b]));

  const actions: NextAction[] = [];
  for (const r of rows) {
    const first = firstName(r.name, "This person");
    if (r.leadId) {
      const lead = leadById.get(r.leadId);
      if (!lead) continue;
      const kind = r.item.kind === "waiting_reply" ? "reply" : "follow_up";
      actions.push({
        id: r.id,
        kind,
        rule: r.item.kind,
        person: { name: r.name, clientId: lead.clientId, conversationId: r.conversationId, leadId: r.leadId, bookingId: null },
        headline: headlineFor(kind, first),
        why: r.item.why,
        stage: stageFor({ rule: r.item.kind, leadStatus: lead.status, quoted: Boolean(lead.quotedAt) }),
        detail: r.detail,
        value: readValue({ quotedCents: lead.quotedCents, budgetCents: lead.budgetCents, servicePriceCents: lead.service?.priceCents, estimatedValueCents: lead.estimatedValueCents }),
        atRisk: isAtRisk({ rule: r.item.kind, since: r.item.since, now }),
        since: r.item.since,
        href: r.href,
        draftMode: kind,
        channel: lead.conversation?.channel ?? null,
        serviceName: lead.service?.name ?? null,
        requestedDateText: lead.requestedDateText,
        booking: null,
      });
    } else if (r.bookingId) {
      const b = bookingById.get(r.bookingId);
      if (!b) continue;
      actions.push({
        id: r.id,
        kind: "confirm_booking",
        rule: r.item.kind,
        person: { name: r.name, clientId: b.clientId, conversationId: b.conversationId, leadId: null, bookingId: b.id },
        headline: headlineFor("confirm_booking", first),
        why: r.item.why,
        stage: stageFor({ rule: r.item.kind, leadStatus: null, quoted: false }),
        detail: r.detail,
        value: b.totalCents && b.totalCents > 0 ? { cents: b.totalCents, basis: "quoted", known: true, label: `Booked at ${(b.totalCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}` } : null,
        atRisk: false,
        since: r.item.since,
        href: r.href,
        draftMode: null,
        channel: b.conversation?.channel ?? null,
        serviceName: b.service.name,
        requestedDateText: null,
        booking: { startAt: b.startAt, location: b.location, totalCents: b.totalCents, serviceName: b.service.name },
      });
    }
  }
  const ranked = rankNextActions(actions);
  return { actions: ranked, atRisk: moneyAtRisk(ranked), generatedAt: now };
}
