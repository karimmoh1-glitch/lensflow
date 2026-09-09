import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { getRescheduleSlots, rescheduleBooking } from "@/app/actions/bookings";

/** GET ?date=YYYY-MM-DD → open slots for that day; POST { startISO, notify } moves the booking (availability re-checked under the workspace lock). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonError("date must be YYYY-MM-DD", 400);
  try { return NextResponse.json({ slots: await getRescheduleSlots(id, date, session) }); } catch (e) { return jsonError(e instanceof Error ? e.message : "Couldn't read the day", 400); }
}
const schema = z.object({ startISO: z.string().datetime(), notify: z.boolean().optional() });
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Pick a time.", 400);
  const r = await rescheduleBooking(id, parsed.data.startISO, { notify: parsed.data.notify ?? true }, session);
  if (!r.ok) return jsonError(r.error, 400);
  return NextResponse.json(r);
}
