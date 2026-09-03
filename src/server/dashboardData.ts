import { prisma } from "@/lib/db";
import { addDays, endOfDay, startOfDay } from "date-fns";
import { scoreLead } from "@/lib/leadScoring";

export async function getTodayBrief(businessId: string) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [todaysBookings, unconfirmed, activeLeads, bookedAgg, collectedAgg, upcoming, paymentsDueToday] = await Promise.all([
    prisma.booking.findMany({
      where: { businessId, startAt: { gte: todayStart, lte: todayEnd }, status: { notIn: ["CANCELED"] } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.booking.count({
      where: { businessId, status: "BOOKED", startAt: { gte: now, lte: addDays(now, 3) } },
    }),
    prisma.lead.findMany({
      where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } },
      include: { service: true },
    }),
    // Sums done at the database, not by pulling every historical row into JS to .reduce()
    // — this page loads on every dashboard visit, so it should stay O(1) regardless of how
    // many bookings/payments a business has accumulated.
    prisma.booking.aggregate({
      where: { businessId, status: { notIn: ["CANCELED", "INQUIRY"] } },
      _sum: { totalCents: true },
    }),
    prisma.payment.aggregate({
      where: { businessId, status: "PAID" },
      _sum: { amountCents: true },
    }),
    prisma.booking.findMany({
      where: { businessId, startAt: { gt: now }, status: { notIn: ["CANCELED"] } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
    prisma.booking.count({
      where: {
        businessId,
        status: { in: ["CONFIRMED", "UPCOMING", "COMPLETED"] },
        startAt: { lte: addDays(now, 2) },
      },
    }),
  ]);

  const bookedCents = bookedAgg._sum.totalCents ?? 0;
  const collectedCents = collectedAgg._sum.amountCents ?? 0;
  const outstandingCents = Math.max(0, bookedCents - collectedCents);

  const scoredLeads = activeLeads
    .map((lead) => {
      const { score, reasons } = scoreLead({
        intent: lead.intent,
        hasRequestedDate: Boolean(lead.requestedDate || lead.requestedDateText),
        requestedDate: lead.requestedDate,
        serviceValueCents: lead.service?.priceCents ?? lead.estimatedValueCents,
        hoursSinceLastInbound: lead.lastInboundAt ? (Date.now() - lead.lastInboundAt.getTime()) / 3_600_000 : 999,
        hasRespondedYet: Boolean(lead.respondedAt),
        fieldsKnownCount: [lead.extractedName, lead.serviceId, lead.requestedDate, lead.requestedLocation, lead.budgetCents].filter(
          Boolean
        ).length,
      });
      return { lead, score, reasons };
    })
    .sort((a, b) => b.score - a.score);

  const hotLeads = scoredLeads.filter((l) => l.score >= 70);
  const newLeadsToday = activeLeads.filter((l) => l.createdAt >= todayStart);
  const needsResponse = activeLeads.filter((l) => !l.respondedAt);

  return {
    todaysBookings,
    unconfirmedSoon: unconfirmed,
    money: { bookedCents, collectedCents, outstandingCents },
    leads: { hot: hotLeads, newToday: newLeadsToday, needsResponse, all: scoredLeads },
    upcoming,
    paymentsDueSoonCount: paymentsDueToday,
  };
}

export type TodayBrief = Awaited<ReturnType<typeof getTodayBrief>>;

export function buildBriefText(brief: TodayBrief, businessName: string): string {
  const parts: string[] = [];
  if (brief.leads.needsResponse.length > 0) {
    parts.push(`respond to ${brief.leads.needsResponse.length} lead${brief.leads.needsResponse.length > 1 ? "s" : ""} waiting on you`);
  }
  if (brief.money.outstandingCents > 0) {
    parts.push(`collect $${(brief.money.outstandingCents / 100).toFixed(0)} in outstanding balances`);
  }
  if (brief.unconfirmedSoon > 0) {
    parts.push(`confirm ${brief.unconfirmedSoon} upcoming booking${brief.unconfirmedSoon > 1 ? "s" : ""}`);
  }
  if (parts.length === 0) return `You're all caught up, ${businessName}. Nothing urgent today.`;
  return `Your biggest priorities today: ${parts.join(", and ")}.`;
}
