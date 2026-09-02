import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileBusiness, isErrorResponse, jsonError } from "@/lib/mobileApi";

/** Booking detail — doubles as the "project" and "payment" screens on mobile: the real
 * booking lifecycle status, financial record, and delivery state all live on this one row,
 * same as src/app/dashboard/bookings/[id]/page.tsx on the web. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const { id } = await params;

  const booking = await prisma.booking.findFirst({
    where: { id, businessId: ctx.business.id },
    include: { client: true, service: true, payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!booking) return jsonError("Not found", 404);

  const paidCents = booking.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amountCents, 0);
  const remainingCents = Math.max(0, booking.totalCents - paidCents);

  return NextResponse.json({
    id: booking.id,
    status: booking.status,
    startAt: booking.startAt,
    endAt: booking.endAt,
    location: booking.location,
    client: { id: booking.client.id, name: booking.client.name, email: booking.client.email, phone: booking.client.phone },
    service: { id: booking.service.id, name: booking.service.name },
    totalCents: booking.totalCents,
    depositCents: booking.depositCents,
    paidCents,
    remainingCents,
    payments: booking.payments.map((p) => ({
      id: p.id,
      purpose: p.purpose,
      method: p.method,
      amountCents: p.amountCents,
      status: p.status,
      reference: p.reference,
      confirmedAt: p.confirmedAt,
    })),
    deliveryUrl: booking.deliveryUrl,
    deliveryNote: booking.deliveryNote,
    deliveredAt: booking.deliveredAt,
  });
}
