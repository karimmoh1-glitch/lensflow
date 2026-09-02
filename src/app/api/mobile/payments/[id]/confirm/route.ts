import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { confirmPayment } from "@/app/actions/bookings";
import { jsonError } from "@/lib/mobileApi";

/**
 * Staff marks a deposit/balance as received (Zelle, bank transfer, cash-in-hand card swipe).
 * Calls the exact same confirmPayment() the web dashboard uses — same role check, same
 * booking-status advancement — just fed the mobile bearer session instead of a cookie.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return jsonError("Unauthorized", 401);
  const { id } = await params;

  try {
    await confirmPayment(id, session);
  } catch {
    return jsonError("Unable to confirm this payment", 403);
  }

  return NextResponse.json({ ok: true });
}
