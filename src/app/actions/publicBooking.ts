"use server";

import { prisma } from "@/lib/db";
import { getAvailableSlots, isSlotStillAvailable } from "@/lib/availability";
import { createCardCheckout } from "@/lib/payments";
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
  const end = addMinutes(start, service.durationMins);

  const stillAvailable = await isSlotStillAvailable(business.id, start, end);
  if (!stillAvailable) throw new Error("That time is no longer available. Please pick another slot.");

  const client =
    (await prisma.client.findFirst({ where: { businessId: business.id, email: params.email } })) ??
    (await prisma.client.create({
      data: { businessId: business.id, name: params.name, email: params.email, phone: params.phone || undefined },
    }));

  const depositCents = Math.round((service.priceCents * business.depositPercent) / 100);

  const booking = await prisma.booking.create({
    data: {
      businessId: business.id,
      clientId: client.id,
      serviceId: service.id,
      startAt: start,
      endAt: end,
      location: params.location || undefined,
      status: "BOOKED",
      totalCents: service.priceCents,
      depositCents,
    },
  });

  // Booking through the public page is the relationship — promote (or confirm) customer.
  await prisma.client.update({ where: { id: client.id }, data: { relationship: "CUSTOMER" } });

  await prisma.auditLog.create({
    data: { businessId: business.id, action: "public_booking_created", targetType: "booking", targetId: booking.id },
  });

  let checkoutUrl: string | null = null;
  const preferredMethod = business.paymentMethods[0];

  if (depositCents > 0 && preferredMethod) {
    const payment = await prisma.payment.create({
      data: {
        businessId: business.id,
        bookingId: booking.id,
        clientId: client.id,
        method: preferredMethod === "card" ? "CARD" : preferredMethod === "zelle" ? "ZELLE" : "BANK_TRANSFER",
        purpose: "DEPOSIT",
        amountCents: depositCents,
        status: "AWAITING_CONFIRMATION",
        reference: preferredMethod !== "card" ? `LF-${booking.id.slice(-6).toUpperCase()}` : null,
      },
    });

    if (preferredMethod === "card") {
      const result = await createCardCheckout({
        amountCents: depositCents,
        description: `Deposit for ${service.name}`,
        successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/book/${params.handle}/confirmed?booking=${booking.id}`,
        cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/book/${params.handle}`,
        metadata: { bookingId: booking.id, businessId: business.id, paymentId: payment.id },
      });
      checkoutUrl = result.url;
    }
  }

  return {
    bookingId: booking.id,
    depositCents,
    totalCents: service.priceCents,
    checkoutUrl,
    paymentMethod: preferredMethod ?? null,
    zelleHandle: business.zelleHandle,
    bankInstructions: business.bankInstructions,
    reference: `LF-${booking.id.slice(-6).toUpperCase()}`,
  };
}
