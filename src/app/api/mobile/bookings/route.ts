import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMobileBusiness, isErrorResponse, jsonError } from "@/lib/mobileApi";
import type { Prisma } from "@prisma/client";

const schema = z.object({ from: z.string().datetime(), to: z.string().datetime() });

/** Calendar / project list — real bookings from the existing Booking table only, in the
 * requested date range. Same role scoping as the web dashboard: a PARTNER only sees
 * bookings explicitly assigned to them, a CLIENT only sees their own — never the full
 * org's calendar. Never a second booking model. */
export async function GET(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;

  const url = new URL(req.url);
  const parsed = schema.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  if (!parsed.success) return jsonError("from and to (ISO datetimes) are required", 400);

  const where: Prisma.BookingWhereInput = {
    businessId: ctx.business.id,
    startAt: { gte: new Date(parsed.data.from), lte: new Date(parsed.data.to) },
  };

  if (ctx.role === "PARTNER") {
    where.assignedMembershipId = ctx.membership.id;
  } else if (ctx.role === "CLIENT") {
    const client = await prisma.client.findFirst({ where: { businessId: ctx.business.id, userId: ctx.user.id } });
    where.clientId = client?.id ?? "__none__";
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: { client: true, service: true },
    orderBy: { startAt: "asc" },
  });

  return NextResponse.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      clientName: b.client.name,
      serviceName: b.service.name,
      startAt: b.startAt,
      endAt: b.endAt,
      location: b.location,
      status: b.status,
    })),
  });
}
