import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { bookLead } from "@/app/actions/leads";
import { getSessionFromRequest } from "@/lib/auth";
import { requireMobileRole, isErrorResponse, jsonError, publicMessage } from "@/lib/mobileApi";

const bookSchema = z.object({ startISO: z.string().datetime() });

/**
 * Converts a lead into a real Booking — the same `bookLead` the inbox uses, fed the mobile
 * bearer session: the slot is re-checked under the workspace lock, a lead already booked
 * or lost is refused, and the confirmation automation and calendar mirror fire once.
 * This route used to re-implement the write without the lock or the state guard, so a
 * double tap booked the same lead twice.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) return jsonError("startISO is required", 400);

  let bookingId: string;
  try {
    ({ bookingId } = await bookLead(id, parsed.data.startISO, null, session));
  } catch (err) {
    const message = publicMessage(err, "Unable to book this inquiry");
    return jsonError(message, /not found/i.test(message) ? 404 : /no longer available/i.test(message) ? 409 : 400);
  }
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { client: { select: { name: true } }, service: { select: { name: true } } } });
  return NextResponse.json({
    bookingId: booking.id,
    startAt: booking.startAt,
    endAt: booking.endAt,
    totalCents: booking.totalCents,
    clientName: booking.client?.name ?? "Client",
    serviceName: booking.service.name,
  });
}
