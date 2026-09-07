"use server";

import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import { fireAutomationEvent } from "@/server/automationRunner";
import { pushBookingToCalendars } from "@/server/calendarSync";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { getAvailableSlots, isSlotStillAvailable } from "@/lib/availability";
import { revalidatePath } from "next/cache";
import { addMinutes } from "date-fns";

/**
 * Staff-facing "Check Availability" for a lead already in the inbox — the missing
 * counterpart to the public booking page's slot picker. Same underlying availability
 * engine (working hours ∩ blocked dates ∩ existing bookings + buffer + lead time), just
 * scoped to a lead's already-known service instead of one picked on a public form.
 */
export async function checkLeadAvailability(leadId: string, dateISO: string, serviceId?: string | null, session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error("Pick a day.");

  const lead = await prisma.lead.findFirst({ where: { id: leadId, businessId: ctx.business.id }, include: { service: true } });
  if (!lead) throw new Error("not found");
  // The inquiry may not have named a service; the owner picks one from the thread. Scoped
  // to this business so a service id from another workspace is simply not found.
  const service = serviceId ? await prisma.service.findFirst({ where: { id: serviceId, businessId: ctx.business.id, active: true } }) : lead.service;
  if (!service) return { slots: [], serviceName: null };

  const slots = await getAvailableSlots(ctx.business.id, new Date(`${dateISO}T00:00:00`), service.durationMins);
  return { slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })), serviceName: service.name };
}

/**
 * Converts a lead into a real Booking, the same way the public booking
 * form does for a self-service client — just staff-initiated from an existing inbox
 * conversation instead of a stranger filling out a form.
 */
export async function bookLead(leadId: string, startISO: string, serviceId?: string | null, actingSession?: SessionPayload | null): Promise<{ bookingId: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], actingSession);
  if (!ctx) throw new Error("unauthorized");
  const { business, session } = ctx;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, businessId: business.id },
    include: { client: true, service: true, conversation: true },
  });
  if (!lead) throw new Error("not found");
  if (lead.status === "BOOKED" || lead.status === "LOST") throw new Error(lead.status === "BOOKED" ? "This inquiry is already booked." : "This inquiry was marked as lost — reopen it first.");
  const service = serviceId ? await prisma.service.findFirst({ where: { id: serviceId, businessId: business.id, active: true } }) : lead.service;
  if (!service) throw new Error("Pick a service first.");
  if (!lead.clientId) throw new Error("This lead has no client record.");

  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) throw new Error("Pick a time.");
  const end = addMinutes(start, service.durationMins);

  const stillAvailable = await isSlotStillAvailable(business.id, start, end);
  if (!stillAvailable) throw new Error("That time is no longer available. Pick another slot.");

  const { booking } = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        businessId: business.id,
        clientId: lead.clientId!,
        conversationId: lead.conversationId,
        serviceId: service.id,
        startAt: start,
        endAt: end,
        status: "BOOKED",
        totalCents: service.priceCents,
      },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { status: "BOOKED", serviceId: service.id } });
    // A booking is what makes someone a customer — not the fact that they wrote in.
    await tx.client.update({ where: { id: lead.clientId! }, data: { relationship: "CUSTOMER" } });
    return { booking };
  });

  await prisma.auditLog.create({
    data: { businessId: business.id, actorId: session.userId, action: "booking_created_from_lead", targetType: "booking", targetId: booking.id },
  });
  await fireAutomationEvent({ businessId: business.id, trigger: "BOOKING_CREATED", targetType: "booking", targetId: booking.id });
  await pushBookingToCalendars(booking.id).catch(() => {});
  if ((await prisma.booking.count({ where: { businessId: business.id } })) === 1) await track("first_booking_created", { businessId: business.id, properties: { via: "inbox" } });

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
  const priorHandled = await prisma.lead.count({ where: { businessId: ctx.business.id, respondedAt: { not: null } } });
  await track(priorHandled <= 1 ? "first_priority_action" : "priority_action", { businessId: ctx.business.id, properties: { via: "done" } });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inbox");
  return {};
}
