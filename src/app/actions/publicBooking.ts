"use server";

import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import { fireAutomationEvent } from "@/server/automationRunner";
import { pushBookingToCalendars } from "@/server/calendarSync";
import { getAvailableSlots, isSlotStillAvailable } from "@/lib/availability";
import { addMinutes } from "date-fns";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export async function getSlotsForDate(handle: string, dateISO: string, serviceId: string) {
  const business = await prisma.business.findUnique({ where: { handle } });
  if (!business) return [];
  const service = await prisma.service.findFirst({ where: { id: serviceId, businessId: business.id } });
  if (!service) return [];
  const slots = await getAvailableSlots(business.id, new Date(dateISO), service.durationMins);
  return slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }));
}

export async function createPublicBooking(params: {
  handle: string;
  serviceId: string;
  startISO: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  notes: string;
}) {
  const ip = await getClientIp();
  if (!rateLimit(`public-booking:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 }).ok) {
    throw new Error("Too many booking attempts. Please wait a few minutes and try again.");
  }

  const business = await prisma.business.findUnique({ where: { handle: params.handle } });
  if (!business) throw new Error("Business not found");
  const service = await prisma.service.findFirst({ where: { id: params.serviceId, businessId: business.id } });
  if (!service) throw new Error("Service not found");

  const start = new Date(params.startISO);
  if (Number.isNaN(start.getTime())) throw new Error("Pick a time from the list.");
  const end = addMinutes(start, service.durationMins);

  // Two people picking the same slot at the same moment: the business row is locked for
  // the check-and-create, so the second attempt waits, re-reads, and is refused. Without
  // this, both reads would pass and both bookings would land.
  const booking = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${business.id} FOR UPDATE`;
      const stillAvailable = await isSlotStillAvailable(business.id, start, end);
      if (!stillAvailable) throw new Error("That time is no longer available. Please pick another slot.");
      const client =
        (await tx.client.findFirst({ where: { businessId: business.id, email: params.email } })) ??
        (await tx.client.create({ data: { businessId: business.id, name: params.name, email: params.email, phone: params.phone || undefined } }));
      return tx.booking.create({
        data: {
          businessId: business.id,
          clientId: client.id,
          serviceId: service.id,
          startAt: start,
          endAt: end,
          location: params.location || undefined,
          status: "BOOKED",
          totalCents: service.priceCents,
        },
      });
    },
    { timeout: 15_000 }
  );
  const client = { id: booking.clientId };

  // Booking through the public page is the relationship — promote (or confirm) customer.
  await prisma.client.update({ where: { id: client.id }, data: { relationship: "CUSTOMER" } });

  await prisma.auditLog.create({
    data: { businessId: business.id, action: "public_booking_created", targetType: "booking", targetId: booking.id },
  });
  await fireAutomationEvent({ businessId: business.id, trigger: "BOOKING_CREATED", targetType: "booking", targetId: booking.id });
  await pushBookingToCalendars(booking.id).catch(() => {});
  if ((await prisma.booking.count({ where: { businessId: business.id } })) === 1) await track("first_booking_created", { businessId: business.id, properties: { via: "booking_page" } });

  return { bookingId: booking.id, totalCents: service.priceCents };
}
