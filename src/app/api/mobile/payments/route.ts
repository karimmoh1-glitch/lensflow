import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileBusiness, isErrorResponse } from "@/lib/mobileApi";
import type { PaymentStatus, Prisma } from "@prisma/client";

const VALID_STATUSES: PaymentStatus[] = ["AWAITING_CONFIRMATION", "PAID", "FAILED", "REFUNDED"];

/** Flat payment list for the mobile Payments tab — real Payment rows only, same table the
 * web dashboard's payments page reads. Role-scoped like every other mobile list: a PARTNER
 * sees only payments on bookings assigned to them, a CLIENT only their own. */
export async function GET(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status = statusParam && VALID_STATUSES.includes(statusParam as PaymentStatus) ? (statusParam as PaymentStatus) : undefined;

  const where: Prisma.PaymentWhereInput = { businessId: ctx.business.id, ...(status ? { status } : {}) };

  if (ctx.role === "PARTNER") {
    where.booking = { assignedMembershipId: ctx.membership.id };
  } else if (ctx.role === "CLIENT") {
    const client = await prisma.client.findFirst({ where: { businessId: ctx.business.id, userId: ctx.user.id } });
    where.clientId = client?.id ?? "__none__";
  }

  const payments = await prisma.payment.findMany({
    where,
    include: { client: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    payments: payments.map((p) => ({
      id: p.id,
      clientName: p.client.name,
      bookingId: p.bookingId,
      purpose: p.purpose,
      method: p.method,
      amountCents: p.amountCents,
      status: p.status,
      reference: p.reference,
      createdAt: p.createdAt,
    })),
  });
}
