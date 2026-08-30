import { prisma } from "@/lib/db";
import { addMinutes, isSameDay, startOfDay } from "date-fns";

export type Slot = { start: Date; end: Date };

/**
 * Computes real bookable slots for a given day: intersects the business's weekly
 * working hours with blocked dates and existing bookings (+ buffer), and enforces
 * the minimum lead time. Never returns static/fake slots.
 */
export async function getAvailableSlots(businessId: string, day: Date, durationMins: number): Promise<Slot[]> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const weekday = day.getDay();

  const [windows, blocked, existingBookings] = await Promise.all([
    prisma.availability.findMany({ where: { businessId, weekday } }),
    prisma.blockedDate.findMany({ where: { businessId } }),
    prisma.booking.findMany({
      where: {
        businessId,
        status: { notIn: ["CANCELED"] },
        startAt: { gte: startOfDay(day), lt: addMinutes(startOfDay(day), 24 * 60) },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  if (blocked.some((b) => isSameDay(b.date, day))) return [];
  if (windows.length === 0) return [];

  const now = new Date();
  const earliestStart = addMinutes(now, business.bookingLeadHours * 60);
  const buffer = business.bufferMinutes;

  const slots: Slot[] = [];
  for (const window of windows) {
    const dayStart = startOfDay(day);
    let cursor = addMinutes(dayStart, window.startMin);
    const windowEnd = addMinutes(dayStart, window.endMin);

    while (addMinutes(cursor, durationMins) <= windowEnd) {
      const slotStart = cursor;
      const slotEnd = addMinutes(cursor, durationMins);

      const conflicts = existingBookings.some((b) => {
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
