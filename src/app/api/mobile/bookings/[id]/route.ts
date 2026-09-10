import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileBusiness, isErrorResponse, jsonError } from "@/lib/mobileApi";
import type { Prisma } from "@prisma/client";

/**
 * Booking detail — the real lifecycle status and delivery state on one row, same as
 * src/app/dashboard/bookings/[id]/page.tsx on the web, and under the same role scoping as
 * the booking list beside it: a PARTNER sees only what is assigned to them, a CLIENT only
 * their own. Without that, either could walk booking ids and read other people's contact
 * details. An id outside the caller's scope answers 404, never a hint that it exists.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const { id } = await params;

  const scope: Prisma.BookingWhereInput = { id, businessId: ctx.business.id };
  if (ctx.role === "PARTNER") {
    scope.assignedMembershipId = ctx.membership.id;
  } else if (ctx.role === "CLIENT") {
    const self = await prisma.client.findFirst({ where: { businessId: ctx.business.id, userId: ctx.user.id }, select: { id: true } });
    scope.clientId = self?.id ?? "__none__";
  }

  const booking = await prisma.booking.findFirst({ where: scope, include: { client: true, service: true } });
  if (!booking) return jsonError("Not found", 404);

  return NextResponse.json({
    id: booking.id,
    status: booking.status,
    startAt: booking.startAt,
    endAt: booking.endAt,
    location: booking.location,
    client: { id: booking.client.id, name: booking.client.name, email: booking.client.email, phone: booking.client.phone },
    service: { id: booking.service.id, name: booking.service.name },
    totalCents: booking.totalCents,
    conversationId: booking.conversationId,
    deliveryUrl: booking.deliveryUrl,
    deliveryNote: booking.deliveryNote,
    deliveredAt: booking.deliveredAt,
  });
}
