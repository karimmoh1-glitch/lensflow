import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth";
import { advanceBookingStatus } from "@/app/actions/bookings";
import { jsonError } from "@/lib/mobileApi";

const schema = z.object({
  status: z.enum([
    "INQUIRY",
    "BOOKED",
    "DEPOSIT_PAID",
    "CONFIRMED",
    "QUESTIONNAIRE_COMPLETE",
    "UPCOMING",
    "COMPLETED",
    "BALANCE_PAID",
    "FOLLOWED_UP",
    "CANCELED",
  ]),
});

/** Moves a booking to the next pipeline stage — same advanceBookingStatus() the web
 * dashboard's booking detail page uses, fed the mobile bearer session. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return jsonError("Unauthorized", 401);
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid status", 400);

  try {
    await advanceBookingStatus(id, parsed.data.status, session);
  } catch {
    return jsonError("Unable to update this booking", 403);
  }

  return NextResponse.json({ ok: true });
}
