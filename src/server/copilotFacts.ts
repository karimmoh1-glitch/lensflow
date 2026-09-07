import { prisma } from "@/lib/db";
import { subDays, addDays, formatDistanceToNowStrict, format } from "date-fns";
import { toZonedDisplayDate } from "@/lib/utils";
import type { BusinessFacts } from "@/lib/copilotAnswer";

/** Gathers a broad snapshot of real business facts for the assistant to answer questions
 * from: conversations, bookings, the calendar and customers. Never money — Daythread does
 * not handle a business's payments. */
export async function gatherBusinessFacts(businessId: string): Promise<{ text: string; data: BusinessFacts }> {
  const now = new Date();
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true, name: true } });
  const tz = business.timezone;

  const [activeLeads, upcomingBookings, unrespondedLeads, coldLeads, unconfirmed, customers, calendars] = await Promise.all([
    prisma.lead.findMany({ where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } }, include: { service: true }, orderBy: { lastInboundAt: "desc" }, take: 10 }),
    prisma.booking.findMany({ where: { businessId, startAt: { gte: now }, status: { notIn: ["CANCELED"] } }, include: { client: true, service: true }, orderBy: { startAt: "asc" }, take: 10 }),
    // Waiting on a reply means the same thing here as in the inbox: the last word in a real
    // conversation is theirs.
    prisma.conversation.findMany({ where: { businessId, category: "PRIORITY", archived: false }, orderBy: { lastMessageAt: "desc" }, take: 400, select: { externalHandle: true, client: { select: { name: true } }, lead: { select: { extractedName: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, createdAt: true } } } }),
    prisma.lead.findMany({ where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, createdAt: { lte: subDays(now, 3) } }, take: 10 }),
    prisma.booking.count({ where: { businessId, status: "BOOKED", startAt: { gte: now } } }),
    prisma.client.count({ where: { businessId, relationship: "CUSTOMER" } }),
    prisma.integration.findMany({ where: { businessId, provider: { in: ["GOOGLE_CALENDAR", "APPLE_CALENDAR"] } }, select: { provider: true, status: true, lastSyncedAt: true } }),
  ]);

  const waitingRows = unrespondedLeads
    .filter((c) => c.messages[0]?.direction === "INBOUND")
    .map((c) => ({ name: c.client?.name ?? c.lead?.extractedName ?? c.externalHandle ?? "Unknown", at: c.messages[0]!.createdAt }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const lines: string[] = [];
  lines.push(`Business: ${business.name}. Timezone: ${tz}. Customers on record: ${customers}.`);
  lines.push(
    activeLeads.length > 0
      ? `Open inquiries (${activeLeads.length}): ${activeLeads.map((l) => `${l.extractedName ?? "Unknown"} — ${l.service?.name ?? "unspecified service"}${l.requestedDateText ? `, wants ${l.requestedDateText}` : ""}`).join("; ")}.`
      : "No open inquiries right now."
  );
  lines.push(
    waitingRows.length > 0
      ? `People still waiting on a reply (${waitingRows.length}): ${waitingRows.map((w) => `${w.name} — wrote ${formatDistanceToNowStrict(w.at)} ago`).join("; ")}.`
      : "Everyone has received a reply."
  );
  lines.push(
    coldLeads.length > 0
      ? `Inquiries going cold, i.e. 3+ days old and not booked (${coldLeads.length}): ${coldLeads.map((l) => l.extractedName ?? "Unknown").join(", ")}.`
      : "No inquiries are going cold."
  );
  lines.push(
    upcomingBookings.length > 0
      ? `Upcoming bookings: ${upcomingBookings.map((b) => `${b.client.name} (${b.service.name}) on ${format(toZonedDisplayDate(b.startAt, tz), "EEE MMM d 'at' h:mm a")}${b.location ? ` at ${b.location}` : ""}, status ${b.status.toLowerCase()}`).join("; ")}.`
      : "No upcoming bookings scheduled."
  );
  lines.push(unconfirmed > 0 ? `${unconfirmed} upcoming booking${unconfirmed === 1 ? " is" : "s are"} not confirmed yet.` : "Every upcoming booking is confirmed.");
  lines.push(
    calendars.length > 0
      ? `Connected calendars: ${calendars.map((c) => `${c.provider === "GOOGLE_CALENDAR" ? "Google" : "Apple"} (${c.status.toLowerCase().replace("_", " ")}${c.lastSyncedAt ? `, synced ${formatDistanceToNowStrict(c.lastSyncedAt)} ago` : ""})`).join("; ")}.`
      : "No external calendar connected."
  );
  const dayKey = (d: Date) => format(toZonedDisplayDate(d, tz), "yyyy-MM-dd");
  const data: BusinessFacts = {
    businessName: business.name,
    timezone: tz,
    customers,
    openInquiries: activeLeads.map((l) => ({ name: l.extractedName ?? "Unknown", service: l.service?.name ?? null, wants: l.requestedDateText ?? null })),
    waiting: waitingRows.map((w) => ({ name: w.name, ago: formatDistanceToNowStrict(w.at) })),
    cold: coldLeads.map((l) => l.extractedName ?? "Unknown"),
    upcoming: upcomingBookings.map((b) => ({ name: b.client.name, service: b.service.name, when: format(toZonedDisplayDate(b.startAt, tz), "EEE MMM d 'at' h:mm a"), dayKey: dayKey(b.startAt), location: b.location ?? null, confirmed: b.status !== "BOOKED" })),
    calendars: calendars.map((c) => ({ provider: c.provider === "GOOGLE_CALENDAR" ? "Google" : "Apple", status: c.status.toLowerCase().replace("_", " "), synced: c.lastSyncedAt ? formatDistanceToNowStrict(c.lastSyncedAt) : null })),
    todayKey: dayKey(now),
    weekKeys: Array.from({ length: 7 }, (_, i) => dayKey(addDays(now, i))),
  };
  return { text: lines.join("\n"), data };
}
