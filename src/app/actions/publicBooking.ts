"use server";

import { prisma } from "@/lib/db";
import { normalizeEmail, normalizePhone } from "@/server/identity";
import { track } from "@/lib/analytics";
import { fireAutomationEvent } from "@/server/automationRunner";
import { pushBookingToCalendars } from "@/server/calendarSync";
import { getAvailableSlots, isSlotStillAvailable } from "@/lib/availability";
import { addMinutes } from "date-fns";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { notifyBusiness } from "@/server/notify";

/** How far ahead the public page will quote times. Beyond this is not a booking request. */
const MAX_LOOKAHEAD_DAYS = 400;

/**
 * The open times on a business's public booking page. Unauthenticated by design — this is
 * what a customer sees before they book — but it answers from the owner's real calendar,
 * including busy blocks pulled from whichever calendar they connected. So it is rate limited
 * like every other public entry point: without that it was an unmetered way to read a
 * business's whole calendar shape day by day, and every call also spends a request against
 * their Google or Microsoft quota.
 *
 * The date is validated rather than trusted: an unparseable one used to reach the database
 * as NaN and come back as a server error.
 */
export async function getSlotsForDate(handle: string, dateISO: string, serviceId: string) {
  if (!rateLimit(`public-slots:${await getClientIp()}`, { limit: 120, windowMs: 60 * 60 * 1000 }).ok) return [];

  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) return [];
  const daysAhead = (date.getTime() - Date.now()) / 86_400_000;
  if (daysAhead > MAX_LOOKAHEAD_DAYS || daysAhead < -1) return [];

  const business = await prisma.business.findUnique({ where: { handle } });
  if (!business) return [];
  const service = await prisma.service.findFirst({ where: { id: serviceId, businessId: business.id } });
  if (!service) return [];
  const slots = await getAvailableSlots(business.id, date, service.durationMins);
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
      const email = normalizeEmail(params.email) ?? params.email.trim().toLowerCase();
      const phone = normalizePhone(params.phone) ?? (params.phone || null);
      const client =
        (await tx.client.findFirst({ where: { businessId: business.id, email: { equals: email, mode: "insensitive" } } })) ??
        (phone ? await tx.client.findFirst({ where: { businessId: business.id, phone } }) : null) ??
        (await tx.client.create({ data: { businessId: business.id, name: params.name, email, phone: phone ?? undefined } }));
      if ((!client.email && email) || (!client.phone && phone)) await tx.client.update({ where: { id: client.id }, data: { email: client.email ?? email, phone: client.phone ?? phone ?? undefined } });
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
  await notifyBusiness(business.id, { kind: "booking", title: "New booking", body: `${params.name.trim()} booked ${service.name} for ${start.toLocaleString("en-US", { timeZone: business.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`, target: { kind: "booking", id: booking.id } }).catch(() => {});
  if ((await prisma.booking.count({ where: { businessId: business.id } })) === 1) await track("first_booking_created", { businessId: business.id, properties: { via: "booking_page" } });

  return { bookingId: booking.id, totalCents: service.priceCents };
}
