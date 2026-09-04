import { prisma } from "@/lib/db";
import { subDays, addDays, differenceInHours } from "date-fns";
import { readRelationship } from "@/lib/relationshipState";

/**
 * The executive view: what happened, what matters, what's at risk, what's coming, what
 * needs me — every number from records. Nothing here is projected or estimated; where a
 * figure is a sum of open opportunities it says so.
 */
export type Intelligence = {
  needsYou: number;
  opportunityCents: number; // estimated value of open leads (what they asked about, priced)
  openLeads: number;
  awaitingFollowUp: Array<{ clientId: string; name: string; why: string; conversationId: string | null }>;
  goingCold: Array<{ leadId: string; name: string; hours: number; valueCents: number; conversationId: string | null }>;
  atRisk: { unconfirmedSoon: number; overdueCents: number; overdueCount: number; failedAutomations: number };
  thisWeek: { bookings: number; bookedCents: number; collectedCents: number; newLeads: number; booked: number };
  responseTimeHours: number | null; // median, last 30 days
  conversion: { leads: number; booked: number; rate: number | null }; // last 90 days
  topCustomers: Array<{ clientId: string; name: string; paidCents: number; bookings: number }>;
  dormantCustomers: number;
  /** Who is carrying what: open conversations per teammate, and how many are waiting on a reply. */
  team: Array<{ membershipId: string; name: string; role: string; open: number; needsReply: number }>;
  unassignedNeedsReply: number;
};

export async function getIntelligence(businessId: string, now = new Date()): Promise<Intelligence> {
  const d30 = subDays(now, 30);
  const d90 = subDays(now, 90);
  const weekEnd = addDays(now, 7);
  const [members, assigned, unassignedNeedsReply] = await Promise.all([
    prisma.orgMembership.findMany({ where: { businessId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "PHOTOGRAPHER", "PARTNER"] } }, include: { user: { select: { name: true } } } }),
    prisma.conversation.findMany({ where: { businessId, archived: false, category: "PRIORITY", assigneeMembershipId: { not: null } }, select: { assigneeMembershipId: true, lead: { select: { respondedAt: true, status: true } } } }),
    prisma.conversation.count({ where: { businessId, archived: false, category: "PRIORITY", assigneeMembershipId: null, lead: { respondedAt: null, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } } }),
  ]);
  const team = members.map((m) => {
    const mine = assigned.filter((c) => c.assigneeMembershipId === m.id);
    return { membershipId: m.id, name: m.user.name, role: m.role, open: mine.length, needsReply: mine.filter((c) => c.lead && !c.lead.respondedAt && !["BOOKED", "LOST"].includes(c.lead.status)).length };
  });
  const [openLeads, waiting, unconfirmedSoon, overdue, failedAutomations, weekBookings, weekCollected, weekNewLeads, weekBooked, respondedLeads, leads90, booked90, customers] = await Promise.all([
    prisma.lead.findMany({ where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } }, include: { client: { select: { id: true, name: true } } } }),
    prisma.lead.count({ where: { businessId, respondedAt: null, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } }),
    prisma.booking.count({ where: { businessId, status: "BOOKED", startAt: { gte: now, lte: addDays(now, 3) } } }),
    prisma.payment.findMany({ where: { businessId, status: "AWAITING_CONFIRMATION", booking: { startAt: { lt: now }, status: { not: "CANCELED" } } }, select: { amountCents: true } }),
    prisma.automationExecution.count({ where: { businessId, result: "failed", ranAt: { gte: subDays(now, 7) } } }),
    prisma.booking.findMany({ where: { businessId, startAt: { gte: now, lte: weekEnd }, status: { not: "CANCELED" } }, select: { totalCents: true } }),
    prisma.payment.aggregate({ where: { businessId, status: "PAID", confirmedAt: { gte: subDays(now, 7) } }, _sum: { amountCents: true } }),
    prisma.lead.count({ where: { businessId, createdAt: { gte: subDays(now, 7) } } }),
    prisma.lead.count({ where: { businessId, status: "BOOKED", updatedAt: { gte: subDays(now, 7) } } }),
    prisma.conversation.findMany({ where: { businessId, category: "PRIORITY", lastMessageAt: { gte: d30 } }, select: { messages: { orderBy: { createdAt: "asc" }, select: { direction: true, createdAt: true } } } }),
    prisma.lead.count({ where: { businessId, createdAt: { gte: d90 } } }),
    prisma.lead.count({ where: { businessId, createdAt: { gte: d90 }, status: "BOOKED" } }),
    prisma.client.findMany({
      where: { businessId, relationship: "CUSTOMER" },
      include: { payments: { where: { status: "PAID" }, select: { amountCents: true, confirmedAt: true } }, bookings: { select: { startAt: true, status: true, service: { select: { name: true } } }, orderBy: { startAt: "desc" } }, conversations: { select: { id: true, lastMessageAt: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, createdAt: true } } }, orderBy: { lastMessageAt: "desc" }, take: 1 }, leads: { select: { status: true, respondedAt: true, lastInboundAt: true, createdAt: true, serviceId: true, requestedDateText: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  ]);

  const hoursSince = (d: Date) => differenceInHours(now, d);
  const goingCold = openLeads
    .filter((l) => l.respondedAt && l.lastInboundAt && l.lastInboundAt < l.respondedAt && hoursSince(l.respondedAt) >= 72)
    .map((l) => ({ leadId: l.id, name: l.client?.name ?? l.extractedName ?? "Unknown", hours: hoursSince(l.respondedAt!), valueCents: l.estimatedValueCents, conversationId: l.conversationId }))
    .sort((a, b) => b.valueCents - a.valueCents)
    .slice(0, 5);

  const awaitingFollowUp: Intelligence["awaitingFollowUp"] = [];
  const topCustomers: Intelligence["topCustomers"] = [];
  let dormantCustomers = 0;
  for (const c of customers) {
    const paid = c.payments.reduce((s, p) => s + p.amountCents, 0);
    topCustomers.push({ clientId: c.id, name: c.name, paidCents: paid, bookings: c.bookings.filter((b) => b.status !== "CANCELED").length });
    const conv = c.conversations[0];
    const last = conv?.messages[0];
    const upcoming = c.bookings.filter((b) => b.startAt >= now && b.status !== "CANCELED").sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
    const completed = c.bookings.filter((b) => b.startAt < now && b.status !== "CANCELED")[0];
    const lead = c.leads[0];
    const r = readRelationship({
      relationship: "CUSTOMER",
      lead: lead ? { status: lead.status, respondedAt: lead.respondedAt, lastInboundAt: lead.lastInboundAt, createdAt: lead.createdAt, hasService: Boolean(lead.serviceId), hasDate: Boolean(lead.requestedDateText) } : null,
      lastInbound: last?.direction === "INBOUND" ? last.createdAt : null,
      lastOutbound: last?.direction === "OUTBOUND" ? last.createdAt : null,
      upcomingBooking: upcoming ? { startAt: upcoming.startAt, label: upcoming.service.name, status: upcoming.status } : null,
      lastCompletedBooking: completed ? { startAt: completed.startAt, label: completed.service.name } : null,
      outstandingCents: 0,
      paidCents: paid,
      now,
    });
    if (r.state === "DORMANT") dormantCustomers++;
    if (r.nextAction && (r.state === "WAITING_ON_YOU" || r.state === "COMPLETED" || r.state === "FOLLOW_UP" || r.state === "DORMANT")) {
      awaitingFollowUp.push({ clientId: c.id, name: c.name, why: r.nextAction.why, conversationId: conv?.id ?? null });
    }
  }
  topCustomers.sort((a, b) => b.paidCents - a.paidCents);

  // Response time: from a person's first message to the first reply, per conversation.
  const responseHours = respondedLeads
    .map((c) => {
      const firstIn = c.messages.find((m) => m.direction === "INBOUND");
      const firstOut = firstIn ? c.messages.find((m) => m.direction === "OUTBOUND" && m.createdAt >= firstIn.createdAt) : undefined;
      return firstIn && firstOut ? (firstOut.createdAt.getTime() - firstIn.createdAt.getTime()) / 3_600_000 : null;
    })
    .filter((h): h is number => h !== null && h >= 0)
    .sort((a, b) => a - b);
  const responseTimeHours = responseHours.length ? responseHours[Math.floor(responseHours.length / 2)] : null;

  return {
    needsYou: waiting,
    opportunityCents: openLeads.reduce((s, l) => s + l.estimatedValueCents, 0),
    openLeads: openLeads.length,
    awaitingFollowUp: awaitingFollowUp.slice(0, 5),
    goingCold,
    atRisk: { unconfirmedSoon, overdueCents: overdue.reduce((s, p) => s + p.amountCents, 0), overdueCount: overdue.length, failedAutomations },
    thisWeek: { bookings: weekBookings.length, bookedCents: weekBookings.reduce((s, b) => s + b.totalCents, 0), collectedCents: weekCollected._sum.amountCents ?? 0, newLeads: weekNewLeads, booked: weekBooked },
    responseTimeHours,
    conversion: { leads: leads90, booked: booked90, rate: leads90 > 0 ? booked90 / leads90 : null },
    topCustomers: topCustomers.slice(0, 3),
    dormantCustomers,
    team,
    unassignedNeedsReply,
  };
}

/** The first minute: the shape of what Daythread found, by category. */
export async function getFirstLook(businessId: string) {
  const rows = await prisma.conversation.groupBy({ by: ["category"], where: { businessId, archived: false }, _count: { _all: true } });
  const by = Object.fromEntries(rows.map((r) => [r.category, r._count._all])) as Partial<Record<string, number>>;
  const total = rows.reduce((s, r) => s + r._count._all, 0);
  const needsYou = await prisma.lead.count({ where: { businessId, respondedAt: null, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } });
  const outbound = await prisma.message.count({ where: { direction: "OUTBOUND", sentByUserId: { not: null }, conversation: { businessId } } });
  return { total, priority: by.PRIORITY ?? 0, automated: by.AUTOMATED ?? 0, promotional: by.PROMOTIONAL ?? 0, vendor: by.VENDOR ?? 0, internal: by.INTERNAL ?? 0, spam: by.SPAM ?? 0, needsYou, hasReplied: outbound > 0 };
}
