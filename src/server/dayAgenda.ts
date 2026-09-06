import { prisma } from "@/lib/db";
import { externalBusyBlocks } from "@/server/calendarSync";
import { addMinutes } from "date-fns";

/**
 * One day, answered: what's on, what's busy elsewhere, and when you're free. Free windows
 * are the business's working hours for that weekday minus bookings (with the buffer) and
 * busy time on connected calendars — the same arithmetic the public booking page uses, so
 * "Am I free at 3?" here and "can a client book 3?" there never disagree.
 */
export type AgendaItem =
  | { kind: "booking"; id: string; startAt: Date; endAt: Date; title: string; subtitle: string; status: string; location: string | null }
  | { kind: "busy"; id: string; startAt: Date; endAt: Date; title: string; subtitle: string; allDay: boolean };

export type DayAgenda = {
  items: AgendaItem[];
  free: Array<{ startAt: Date; endAt: Date }>;
  working: Array<{ startAt: Date; endAt: Date }>;
  blocked: boolean;
  calendars: Array<{ provider: "GOOGLE_CALENDAR" | "APPLE_CALENDAR"; status: string; lastSyncedAt: Date | null }>;
};

function zonedTimeToUtc(year: number, month: number, date: number, minutesFromMidnight: number, timeZone: string): Date {
  const utcGuess = new Date(Date.UTC(year, month, date, Math.floor(minutesFromMidnight / 60), minutesFromMidnight % 60));
  const asIfUtc = new Date(utcGuess.toLocaleString("en-US", { timeZone: "UTC" }));
  const asIfZoned = new Date(utcGuess.toLocaleString("en-US", { timeZone }));
  return new Date(utcGuess.getTime() + (asIfUtc.getTime() - asIfZoned.getTime()));
}

/** `day` is a calendar date in the business's zone: year/month/date only. */
export async function getDayAgenda(businessId: string, day: { year: number; month: number; date: number }): Promise<DayAgenda> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const tz = business.timezone;
  const start = zonedTimeToUtc(day.year, day.month, day.date, 0, tz);
  const end = zonedTimeToUtc(day.year, day.month, day.date, 24 * 60, tz);
  const weekday = new Date(Date.UTC(day.year, day.month, day.date)).getUTCDay();

  const [bookings, external, windows, blocked, calendars] = await Promise.all([
    prisma.booking.findMany({ where: { businessId, status: { not: "CANCELED" }, startAt: { lt: end }, endAt: { gt: start } }, include: { client: true, service: true }, orderBy: { startAt: "asc" } }),
    prisma.externalEvent.findMany({ where: { businessId, bookingId: null, status: { not: "cancelled" }, startAt: { lt: end }, endAt: { gt: start }, integration: { status: { in: ["CONNECTED", "SYNC_ERROR"] } } }, orderBy: { startAt: "asc" }, include: { integration: { select: { provider: true } } } }),
    prisma.availability.findMany({ where: { businessId, weekday } }),
    prisma.blockedDate.findFirst({ where: { businessId, date: { gte: start, lt: end } } }),
    prisma.integration.findMany({ where: { businessId, provider: { in: ["GOOGLE_CALENDAR", "APPLE_CALENDAR"] }, status: { not: "NOT_CONNECTED" } }, select: { provider: true, status: true, lastSyncedAt: true } }),
  ]);

  const items: AgendaItem[] = [
    ...bookings.map((b) => ({ kind: "booking" as const, id: b.id, startAt: b.startAt, endAt: b.endAt, title: b.client.name, subtitle: b.service.name, status: b.status, location: b.location })),
    ...external.map((e) => ({ kind: "busy" as const, id: e.id, startAt: e.startAt, endAt: e.endAt, title: e.title?.trim() || "Busy", subtitle: `${e.integration.provider === "GOOGLE_CALENDAR" ? "Google" : "Apple"} Calendar${e.transparent ? " · marked free" : ""}`, allDay: e.allDay })),
  ].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const working = windows.map((w) => ({ startAt: zonedTimeToUtc(day.year, day.month, day.date, w.startMin, tz), endAt: zonedTimeToUtc(day.year, day.month, day.date, w.endMin, tz) })).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const busy = [...bookings.map((b) => ({ startAt: addMinutes(b.startAt, -business.bufferMinutes), endAt: addMinutes(b.endAt, business.bufferMinutes) })), ...(await externalBusyBlocks(businessId, start, end))].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const free: Array<{ startAt: Date; endAt: Date }> = [];
  if (!blocked) {
    for (const w of working) {
      let cursor = w.startAt;
      for (const b of busy) {
        if (b.endAt <= cursor || b.startAt >= w.endAt) continue;
        if (b.startAt > cursor) free.push({ startAt: cursor, endAt: b.startAt });
        if (b.endAt > cursor) cursor = b.endAt;
      }
      if (cursor < w.endAt) free.push({ startAt: cursor, endAt: w.endAt });
    }
  }
  // Windows shorter than half an hour aren't usable for anything.
  const usable = free.filter((f) => f.endAt.getTime() - f.startAt.getTime() >= 30 * 60_000);

  return { items, free: usable, working, blocked: Boolean(blocked), calendars: calendars.map((c) => ({ provider: c.provider as "GOOGLE_CALENDAR" | "APPLE_CALENDAR", status: c.status, lastSyncedAt: c.lastSyncedAt })) };
}
