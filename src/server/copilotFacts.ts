import { prisma } from "@/lib/db";
import { startOfMonth, subDays, formatDistanceToNowStrict } from "date-fns";
import { formatMoney } from "@/lib/utils";

/** Gathers a broad snapshot of real business facts for the copilot to answer questions from. */
export async function gatherBusinessFacts(businessId: string): Promise<string> {
  const now = new Date();
  const monthStart = startOfMonth(now);

  const [overduePayments, hotLeadsRaw, upcomingBookings, monthPayments, unrespondedLeads, coldLeads] = await Promise.all([
    prisma.payment.findMany({
      where: { businessId, status: "AWAITING_CONFIRMATION" },
      include: { client: true },
    }),
    prisma.lead.findMany({
      where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } },
      include: { service: true },
      orderBy: { estimatedValueCents: "desc" },
      take: 10,
    }),
    prisma.booking.findMany({
      where: { businessId, startAt: { gte: now }, status: { notIn: ["CANCELED"] } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" },
      take: 10,
    }),
    prisma.payment.findMany({ where: { businessId, status: "PAID", confirmedAt: { gte: monthStart } } }),
    prisma.lead.findMany({
      where: { businessId, respondedAt: null, status: { in: ["NEW", "CONTACTED"] } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.lead.findMany({
      where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, createdAt: { lte: subDays(now, 3) } },
    }),
  ]);

  const monthRevenue = monthPayments.reduce((s, p) => s + p.amountCents, 0);

  const lines: string[] = [];
  lines.push(`Revenue collected this month: ${formatMoney(monthRevenue)}.`);

  lines.push(
    overduePayments.length > 0
      ? `Overdue / unconfirmed payments (${overduePayments.length}): ${overduePayments
          .map((p) => `${p.client.name} owes ${formatMoney(p.amountCents)}`)
          .join("; ")}.`
      : "No overdue or unconfirmed payments."
  );

  lines.push(
    hotLeadsRaw.length > 0
      ? `Active leads (${hotLeadsRaw.length}): ${hotLeadsRaw
          .map((l) => `${l.extractedName ?? "Unknown"} — ${l.service?.name ?? "unspecified service"}, est. ${formatMoney(l.estimatedValueCents)}`)
          .join("; ")}.`
      : "No active leads right now."
  );

  lines.push(
    unrespondedLeads.length > 0
      ? `Leads that haven't received a reply (${unrespondedLeads.length}): ${unrespondedLeads
          .map((l) => `${l.extractedName ?? "Unknown"} — inquired ${formatDistanceToNowStrict(l.createdAt)} ago`)
          .join("; ")}.`
      : "Every lead has received a reply."
  );

  lines.push(
    coldLeads.length > 0
      ? `Leads going cold, i.e. inquired 3+ days ago and never booked (${coldLeads.length}): ${coldLeads
          .map((l) => l.extractedName ?? "Unknown")
          .join(", ")}.`
      : "No leads are going cold."
  );

  lines.push(
    upcomingBookings.length > 0
      ? `Upcoming bookings: ${upcomingBookings
          .map((b) => `${b.client.name} (${b.service.name}) on ${b.startAt.toDateString()}, status ${b.status}`)
          .join("; ")}.`
      : "No upcoming bookings scheduled."
  );

  return lines.join("\n");
}
