import { prisma } from "@/lib/db";
import { addMinutes, isSameDay } from "date-fns";
import { externalBusyBlocks } from "@/server/calendarSync";

export type Slot = { start: Date; end: Date };

/**
 * Converts a "wall clock" time in a given IANA timezone to the correct UTC Date — no
 * extra dependency needed, just the Intl API. This matters because the server (Vercel,
 * UTC) and a business's configured timezone (e.g. America/Chicago) are almost never the
 * same: naive date math that ignores this silently computes "9am" in the server's zone
 * instead of the business's, which is wrong by however many hours separate them.
 */
function zonedTimeToUtc(year: number, month: number, date: number, minutesFromMidnight: number, timeZone: string): Date {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  const utcGuess = new Date(Date.UTC(year, month, date, hours, minutes));
  const asIfUtc = new Date(utcGuess.toLocaleString("en-US", { timeZone: "UTC" }));
  const asIfZoned = new Date(utcGuess.toLocaleString("en-US", { timeZone }));
  const offsetMs = asIfUtc.getTime() - asIfZoned.getTime();
  return new Date(utcGuess.getTime() + offsetMs);
}

/**
 * Computes real bookable slots for a given day: intersects the business's weekly
 * working hours with blocked dates and existing bookings (+ buffer), and enforces
 * the minimum lead time. Never returns static/fake slots.
 */
export async function getAvailableSlots(businessId: string, day: Date, durationMins: number): Promise<Slot[]> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const weekday = day.getDay();
  const year = day.getFullYear();
  const month = day.getMonth();
  const date = day.getDate();

  const dayStartUtc = zonedTimeToUtc(year, month, date, 0, business.timezone);
  const dayEndUtc = zonedTimeToUtc(year, month, date, 24 * 60, business.timezone);

  const [windows, blocked, existingBookings, externalBusy] = await Promise.all([
    prisma.availability.findMany({ where: { businessId, weekday } }),
    prisma.blockedDate.findMany({ where: { businessId } }),
    prisma.booking.findMany({
      where: {
        businessId,
        status: { notIn: ["CANCELED"] },
        startAt: { gte: dayStartUtc, lt: dayEndUtc },
      },
      select: { startAt: true, endAt: true },
    }),
    // Busy time on a connected Google / Apple calendar can't be booked over either.
    externalBusyBlocks(businessId, dayStartUtc, dayEndUtc),
  ]);
  const busy = [...existingBookings, ...externalBusy];

  if (blocked.some((b) => isSameDay(b.date, day))) return [];
  if (windows.length === 0) return [];

  const now = new Date();
  const earliestStart = addMinutes(now, business.bookingLeadHours * 60);
  const buffer = business.bufferMinutes;

  const slots: Slot[] = [];
  for (const window of windows) {
    let cursor = zonedTimeToUtc(year, month, date, window.startMin, business.timezone);
    const windowEnd = zonedTimeToUtc(year, month, date, window.endMin, business.timezone);

    while (addMinutes(cursor, durationMins) <= windowEnd) {
      const slotStart = cursor;
      const slotEnd = addMinutes(cursor, durationMins);

      const conflicts = busy.some((b) => {
        const bufferedStart = addMinutes(b.startAt, -buffer);
        const bufferedEnd = addMinutes(b.endAt, buffer);
        return slotStart < bufferedEnd && slotEnd > bufferedStart;
      });

      if (!conflicts && slotStart >= earliestStart) {
        slots.push({ start: slotStart, end: slotEnd });
      }
      cursor = addMinutes(cursor, 30); // 30-min grid
    }
  }

  return slots;
}

export async function isSlotStillAvailable(businessId: string, start: Date, end: Date): Promise<boolean> {
  const slots = await getAvailableSlots(businessId, start, (end.getTime() - start.getTime()) / 60_000);
  return slots.some((s) => s.start.getTime() === start.getTime());
}
