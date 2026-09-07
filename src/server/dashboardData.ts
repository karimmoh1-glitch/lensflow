import { prisma } from "@/lib/db";
import { addDays, endOfDay, startOfDay } from "date-fns";

export async function getTodayBrief(businessId: string) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [todaysBookings, unconfirmed, activeLeads, upcoming] = await Promise.all([
    prisma.booking.findMany({
      where: { businessId, startAt: { gte: todayStart, lte: todayEnd }, status: { notIn: ["CANCELED"] } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.booking.count({ where: { businessId, status: "BOOKED", startAt: { gte: now, lte: addDays(now, 3) } } }),
    prisma.lead.findMany({
      where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, conversation: { archived: false, category: "PRIORITY" } },
      include: { service: true },
      orderBy: { lastInboundAt: "asc" },
    }),
    prisma.booking.findMany({
      where: { businessId, startAt: { gt: now }, status: { notIn: ["CANCELED"] } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
  ]);

  // Who needs you, oldest wait first; who asked for a specific date or service is "warm".
  const needsResponse = activeLeads.filter((l) => !l.respondedAt);
  const warm = activeLeads.filter((l) => l.serviceId || l.requestedDateText || l.requestedDate);
  const newLeadsToday = activeLeads.filter((l) => l.createdAt >= todayStart);

  return {
    todaysBookings,
    unconfirmedSoon: unconfirmed,
    leads: { warm, newToday: newLeadsToday, needsResponse, all: activeLeads },
    upcoming,
  };
}

export type TodayBrief = Awaited<ReturnType<typeof getTodayBrief>>;

export function buildBriefText(brief: TodayBrief, businessName: string): string {
  const parts: string[] = [];
  if (brief.leads.needsResponse.length > 0) parts.push(`reply to ${brief.leads.needsResponse.length} ${brief.leads.needsResponse.length === 1 ? "person" : "people"} waiting on you`);
  if (brief.unconfirmedSoon > 0) parts.push(`confirm ${brief.unconfirmedSoon} upcoming booking${brief.unconfirmedSoon > 1 ? "s" : ""}`);
  if (parts.length === 0) return `You're all caught up, ${businessName}. Nothing urgent today.`;
  return `Your biggest priorities today: ${parts.join(", and ")}.`;
}
