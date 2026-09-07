import { prisma } from "@/lib/db";
import { addDays } from "date-fns";
import { leadAttention, bookingAttention, sortAttention, CONFIRM_WITHIN_DAYS, type AttentionItem } from "@/lib/attention";
import { toZonedDisplayDate } from "@/lib/utils";
import { format } from "date-fns";

export type AttentionRow = {
  id: string;
  item: AttentionItem;
  name: string;
  href: string;
  /** For leads: what they asked about, if known. */
  detail: string | null;
  leadId: string | null;
  conversationId: string | null;
  bookingId: string | null;
};

/**
 * Everything that needs the owner today, from the record and nothing else: open leads
 * whose conversation is a real person's, and bookings within CONFIRM_WITHIN_DAYS that
 * aren't confirmed. Tenant-scoped by businessId at the query.
 */
export async function getAttention(businessId: string, now = new Date(), timezone = "America/New_York"): Promise<AttentionRow[]> {
  const [leads, bookings] = await Promise.all([
    prisma.lead.findMany({
      where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } },
      include: { service: { select: { name: true } }, conversation: { select: { id: true, archived: true, category: true } }, client: { select: { name: true, bookings: { where: { startAt: { gte: now }, status: { not: "CANCELED" } }, select: { id: true }, take: 1 } } } },
    }),
    prisma.booking.findMany({
      where: { businessId, status: { in: ["BOOKED", "INQUIRY"] }, startAt: { gte: now, lte: addDays(now, CONFIRM_WITHIN_DAYS + 1) } },
      include: { client: { select: { name: true } }, service: { select: { name: true } } },
    }),
  ]);

  const rows: AttentionRow[] = [];
  for (const l of leads) {
    const item = leadAttention(
      {
        status: l.status,
        respondedAt: l.respondedAt,
        lastInboundAt: l.lastInboundAt,
        followUpAt: l.followUpAt,
        createdAt: l.createdAt,
        hasService: Boolean(l.serviceId),
        hasDate: Boolean(l.requestedDateText || l.requestedDate),
        hidden: !l.conversation || l.conversation.archived || l.conversation.category !== "PRIORITY",
        hasUpcomingBooking: (l.client?.bookings.length ?? 0) > 0,
      },
      now
    );
    if (!item) continue;
    const detail = l.service ? `Asked about ${l.service.name}${l.requestedDateText ? ` for ${l.requestedDateText}` : ""}` : l.requestedDateText ? `Asked for ${l.requestedDateText}` : null;
    rows.push({ id: `lead:${l.id}`, item, name: l.client?.name || l.extractedName || "Unknown", href: l.conversationId ? `/dashboard/inbox?c=${l.conversationId}` : "/dashboard/inbox", detail, leadId: l.id, conversationId: l.conversationId, bookingId: null });
  }
  for (const b of bookings) {
    const label = `${b.client.name} · ${b.service.name}`;
    const item = bookingAttention({ status: b.status, startAt: b.startAt, label }, now);
    if (!item) continue;
    rows.push({ id: `booking:${b.id}`, item, name: b.client.name, href: `/dashboard/bookings/${b.id}`, detail: `${b.service.name} · ${format(toZonedDisplayDate(b.startAt, timezone), "EEE, MMM d · h:mm a")}`, leadId: null, conversationId: null, bookingId: b.id });
  }
  return sortAttention(rows);
}
