import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileBusiness, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getAvailableSlots } from "@/lib/availability";

/** "Check Availability" — real bookable slots for the lead's service on a given day,
 * computed the same way the public booking page does (working hours ∩ blocked dates ∩
 * existing bookings + buffer + lead time). Never static/fake slots. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const { id } = await params;

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date"); // YYYY-MM-DD
  if (!dateParam) return jsonError("date query param is required", 400);

  const lead = await prisma.lead.findFirst({ where: { id, businessId: ctx.business.id }, include: { service: true } });
  if (!lead) return jsonError("Not found", 404);
  if (!lead.service) return jsonError("This lead has no service assigned yet", 400);

  const slots = await getAvailableSlots(ctx.business.id, new Date(`${dateParam}T00:00:00`), lead.service.durationMins);

  return NextResponse.json({
    service: { id: lead.service.id, name: lead.service.name, priceCents: lead.service.priceCents, durationMins: lead.service.durationMins },
    slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
  });
}
