import { NextResponse } from "next/server";
import { z } from "zod";
import { addMinutes } from "date-fns";
import { prisma } from "@/lib/db";
import { fireAutomationEvent } from "@/server/automationRunner";
import { pushBookingToCalendars } from "@/server/calendarSync";
import { requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { isSlotStillAvailable } from "@/lib/availability";

const bookSchema = z.object({ startISO: z.string() });

/**
 * Converts a lead into a real Booking + deposit Payment record — the mobile equivalent of
 * the public booking form, but starting from an existing lead/client instead of a
 * stranger's contact info. Re-checks the slot is still open (another booking could have
 * landed between "Check Availability" and this tap) before writing anything.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (isErrorResponse(ctx)) return ctx;
  const { id } = await params;
  const { business } = ctx;

  const body = await req.json().catch(() => null);
  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) return jsonError("startISO is required", 400);

  const lead = await prisma.lead.findFirst({ where: { id, businessId: business.id }, include: { client: true, service: true, conversation: true } });
  if (!lead) return jsonError("Not found", 404);
  if (!lead.service) return jsonError("This lead has no service assigned yet", 400);
  if (!lead.clientId) return jsonError("This lead has no client record", 400);

  const start = new Date(parsed.data.startISO);
  const end = addMinutes(start, lead.service.durationMins);

  const stillAvailable = await isSlotStillAvailable(business.id, start, end);
  if (!stillAvailable) return jsonError("That time is no longer available. Pick another slot.", 409);

  const depositCents = Math.round((lead.service.priceCents * business.depositPercent) / 100);

  const { booking, payment } = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        businessId: business.id,
        clientId: lead.clientId!,
        conversationId: lead.conversationId,
        serviceId: lead.service!.id,
        startAt: start,
        endAt: end,
        status: "BOOKED",
        totalCents: lead.service!.priceCents,
        depositCents,
      },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { status: "BOOKED" } });
    await tx.client.update({ where: { id: lead.clientId! }, data: { relationship: "CUSTOMER" } });
    const payment =
      depositCents > 0
        ? await tx.payment.create({
            data: {
              businessId: business.id,
              bookingId: booking.id,
              clientId: lead.clientId!,
              method: "ZELLE",
              purpose: "DEPOSIT",
              amountCents: depositCents,
              status: "AWAITING_CONFIRMATION",
              reference: `LF-${booking.id.slice(-6).toUpperCase()}`,
            },
          })
        : null;
    return { booking, payment };
  });

  await prisma.auditLog.create({
    data: { businessId: business.id, actorId: ctx.session.userId, action: "mobile_booking_created", targetType: "booking", targetId: booking.id },
  });
  await fireAutomationEvent({ businessId: business.id, trigger: "BOOKING_CREATED", targetType: "booking", targetId: booking.id });
  await pushBookingToCalendars(booking.id).catch(() => {});

  return NextResponse.json({
    bookingId: booking.id,
    paymentId: payment?.id ?? null,
    startAt: booking.startAt,
    endAt: booking.endAt,
    totalCents: booking.totalCents,
    depositCents: booking.depositCents,
    clientName: lead.client?.name ?? "Client",
    serviceName: lead.service.name,
  });
}
