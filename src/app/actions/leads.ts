"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getAvailableSlots, isSlotStillAvailable } from "@/lib/availability";
import { revalidatePath } from "next/cache";
import { addMinutes } from "date-fns";

/**
 * Staff-facing "Check Availability" for a lead already in the inbox — the missing
 * counterpart to the public booking page's slot picker. Same underlying availability
 * engine (working hours ∩ blocked dates ∩ existing bookings + buffer + lead time), just
 * scoped to a lead's already-known service instead of one picked on a public form.
 */
export async function checkLeadAvailability(leadId: string, dateISO: string) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");

  const lead = await prisma.lead.findFirst({ where: { id: leadId, businessId: ctx.business.id }, include: { service: true } });
  if (!lead) throw new Error("not found");
  if (!lead.service) return { slots: [], serviceName: null };

  const slots = await getAvailableSlots(ctx.business.id, new Date(`${dateISO}T00:00:00`), lead.service.durationMins);
  return { slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })), serviceName: lead.service.name };
}

/**
 * Converts a lead into a real Booking + deposit Payment, the same way the public booking
 * form does for a self-service client — just staff-initiated from an existing inbox
 * conversation instead of a stranger filling out a form.
 */
export async function bookLead(leadId: string, startISO: string): Promise<{ bookingId: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");
  const { business, session } = ctx;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, businessId: business.id },
    include: { client: true, service: true, conversation: true },
  });
  if (!lead) throw new Error("not found");
  if (!lead.service) throw new Error("This lead has no service assigned yet.");
  if (!lead.clientId) throw new Error("This lead has no client record.");

  const start = new Date(startISO);
  const end = addMinutes(start, lead.service.durationMins);

  const stillAvailable = await isSlotStillAvailable(business.id, start, end);
  if (!stillAvailable) throw new Error("That time is no longer available. Pick another slot.");

  const depositCents = Math.round((lead.service.priceCents * business.depositPercent) / 100);

  const { booking } = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        businessId: business.id,
        clientId: lead.clientId!,
        conversationId: lead.conversationId,
        serviceId: lead.service!.id,
        startAt: start,
        endAt: end,
        status: "BOOKED",
        totalCents: lead.service!.priceCents,
        depositCents,
      },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { status: "BOOKED" } });
    // A booking is what makes someone a customer — not the fact that they wrote in.
    await tx.client.update({ where: { id: lead.clientId! }, data: { relationship: "CUSTOMER" } });
    if (depositCents > 0) {
      await tx.payment.create({
        data: {
          businessId: business.id,
          bookingId: booking.id,
          clientId: lead.clientId!,
          method: "ZELLE",
          purpose: "DEPOSIT",
          amountCents: depositCents,
          status: "AWAITING_CONFIRMATION",
          reference: `LF-${booking.id.slice(-6).toUpperCase()}`,
        },
      });
    }
    return { booking };
  });

  await prisma.auditLog.create({
    data: { businessId: business.id, actorId: session.userId, action: "booking_created_from_lead", targetType: "booking", targetId: booking.id },
  });

  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");

  return { bookingId: booking.id };
}

/**
 * "Done" on the One Thing card. Marks the lead as responded to — the same field a real
 * reply sets — so the next priority rises. Tenant-scoped: a lead id from another business
 * is simply not found. Returns { error } for expected outcomes instead of throwing.
 */
export async function markLeadHandled(leadId: string): Promise<{ error?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) return { error: "Please log in again." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, businessId: ctx.business.id }, select: { id: true, status: true } });
  if (!lead) return { error: "That lead isn't here anymore." };
  await prisma.lead.update({
    where: { id: lead.id },
    data: { respondedAt: new Date(), status: lead.status === "NEW" ? "CONTACTED" : lead.status },
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inbox");
  return {};
}
