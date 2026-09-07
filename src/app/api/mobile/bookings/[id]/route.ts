import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileBusiness, isErrorResponse, jsonError } from "@/lib/mobileApi";

/** Booking detail — the real lifecycle status and delivery state on one row, same as
 * src/app/dashboard/bookings/[id]/page.tsx on the web. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const { id } = await params;

  const booking = await prisma.booking.findFirst({ where: { id, businessId: ctx.business.id }, include: { client: true, service: true } });
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
