import { prisma } from "@/lib/db";
import { subDays, addDays, formatDistanceToNowStrict, format } from "date-fns";
import { toZonedDisplayDate } from "@/lib/utils";
import type { BusinessFacts } from "@/lib/copilotAnswer";
import { getNextActions } from "@/server/nextActions";
import { readValue, money } from "@/lib/nextAction";
import { readBusinessMemory, memoryPromptLines } from "@/lib/businessMemory";
const CHANNEL_LABEL: Record<string, string> = { INSTAGRAM: "Instagram", EMAIL: "Email", SMS: "SMS", WHATSAPP: "WhatsApp", WEBSITE: "Booking page", PHONE: "Phone" };

/** Gathers a broad snapshot of real business facts for the assistant to answer questions
 * from: conversations, bookings, the calendar and customers. Never money — Daythread does
 * not handle a business's payments. */
export async function gatherBusinessFacts(businessId: string): Promise<{ text: string; data: BusinessFacts }> {
  const now = new Date();
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true, name: true, memory: true } });
  const tz = business.timezone;
  const weekAgo = subDays(now, 7);
  const monthAgo = subDays(now, 30);
  const dayAgo = subDays(now, 1);

  const [next, quoted, openValued, channelRows, responded, sinceYesterday] = await Promise.all([
    getNextActions(businessId, now, tz),
    prisma.lead.findMany({ where: { businessId, quotedAt: { gte: weekAgo } }, select: { quotedCents: true, quotedAt: true, status: true, lastInboundAt: true, client: { select: { name: true } }, extractedName: true }, orderBy: { quotedAt: "desc" }, take: 20 }),
    prisma.lead.findMany({ where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, conversation: { archived: false, category: "PRIORITY" } }, select: { quotedCents: true, budgetCents: true, estimatedValueCents: true, client: { select: { name: true } }, extractedName: true, service: { select: { name: true, priceCents: true } } } }),
    prisma.conversation.groupBy({ by: ["channel"], where: { businessId, category: "PRIORITY", archived: false, createdAt: { gte: monthAgo } }, _count: { _all: true } }),
    prisma.lead.findMany({ where: { businessId, respondedAt: { gte: weekAgo }, createdAt: { lte: now } }, select: { createdAt: true, respondedAt: true }, take: 200 }),
    Promise.all([
      prisma.conversation.count({ where: { businessId, category: "PRIORITY", archived: false, createdAt: { gte: dayAgo } } }),
      prisma.booking.count({ where: { businessId, createdAt: { gte: dayAgo }, status: { not: "CANCELED" } } }),
    ]),
  ]);
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
  // Money: known (a quote that went out, a budget they named) kept apart from a service's list price.
  const valued = openValued.map((l) => ({ name: l.client?.name ?? l.extractedName ?? "Unknown", value: readValue({ quotedCents: l.quotedCents, budgetCents: l.budgetCents, servicePriceCents: l.service?.priceCents, estimatedValueCents: l.estimatedValueCents }) })).filter((v) => v.value);
  const biggest = [...valued].sort((a, b) => (b.value!.cents) - (a.value!.cents))[0] ?? null;
  const quotes = quoted.filter((q) => q.quotedCents && q.quotedAt).map((q) => ({ name: q.client?.name ?? q.extractedName ?? "Unknown", cents: q.quotedCents!, when: formatDistanceToNowStrict(q.quotedAt!), answered: Boolean(q.lastInboundAt && q.quotedAt && q.lastInboundAt > q.quotedAt), booked: q.status === "BOOKED" }));
  // Channel mix and response time only when there is enough to say something true.
  const channelTotal = channelRows.reduce((n, r) => n + r._count._all, 0);
  const channels = channelTotal >= 5 ? channelRows.map((r) => ({ channel: CHANNEL_LABEL[r.channel] ?? r.channel, count: r._count._all })).sort((a, b) => b.count - a.count) : null;
  const hoursToReply = responded.filter((l) => l.respondedAt).map((l) => (l.respondedAt!.getTime() - l.createdAt.getTime()) / 3_600_000).filter((h) => h >= 0).sort((a, b) => a - b);
  const medianReplyHours = hoursToReply.length >= 5 ? hoursToReply[Math.floor(hoursToReply.length / 2)] : null;
  lines.push(
    next.actions.length > 0
      ? `What to do next, in order (${next.actions.length}): ${next.actions.slice(0, 8).map((a) => `${a.headline} — ${a.why}${a.value ? ` (${a.value.label}${a.value.known ? "" : ", an estimate"})` : ""}`).join("; ")}.`
      : "Nothing needs the owner right now: nobody is waiting, nothing is going cold, every upcoming booking is confirmed."
  );
  if (next.atRisk.people > 0) lines.push(`Money that may be going cold: ${money(next.atRisk.knownCents)} quoted or budgeted (known) and about ${money(next.atRisk.estimatedCents)} in service prices (estimate) across ${next.atRisk.people} people.`);
  lines.push(quotes.length > 0 ? `Quotes sent in the last 7 days (${quotes.length}): ${quotes.map((q) => `${q.name} — ${money(q.cents)}, ${q.when} ago, ${q.booked ? "booked" : q.answered ? "they replied" : "no reply yet"}`).join("; ")}.` : "No quotes were sent in the last 7 days (a quote is a reply that names a price).");
  lines.push(biggest ? `Biggest open opportunity: ${biggest.name} — ${biggest.value!.label}${biggest.value!.known ? "" : " (an estimate)"}.` : "No open inquiry has a known or estimated value.");
  lines.push(channels ? `Where people wrote from, last 30 days: ${channels.map((c) => `${c.channel} ${c.count}`).join(", ")}.` : "Not enough conversations in the last 30 days to say where people come from (fewer than 5).");
  lines.push(medianReplyHours !== null ? `Typical time to a first reply this week: ${medianReplyHours < 1 ? "under an hour" : `${Math.round(medianReplyHours)} hours`} (median of ${hoursToReply.length}).` : "Not enough replies this week to measure response time (fewer than 5).");
  lines.push(`Since yesterday: ${sinceYesterday[0]} new ${sinceYesterday[0] === 1 ? "person" : "people"} wrote in, ${sinceYesterday[1]} ${sinceYesterday[1] === 1 ? "booking was" : "bookings were"} made.`);
  const memoryLines = memoryPromptLines(readBusinessMemory(business.memory));
  if (memoryLines.length > 0) lines.push(`About the business, in the owner's words: ${memoryLines.join(" ")}`);
  lines.push("If the facts above do not contain the answer, say: I don't have enough information to determine that.");
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
    next: next.actions.slice(0, 8).map((a) => ({ headline: a.headline, why: a.why, value: a.value ? { label: a.value.label, known: a.value.known } : null })),
    atRisk: next.atRisk,
    quotes,
    biggest: biggest ? { name: biggest.name, label: biggest.value!.label, known: biggest.value!.known } : null,
    channels,
    medianReplyHours,
    sinceYesterday: { people: sinceYesterday[0], bookings: sinceYesterday[1] },
  };
  return { text: lines.join("\n"), data };
}
