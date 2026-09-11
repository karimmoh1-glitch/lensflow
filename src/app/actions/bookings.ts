"use server";

import { prisma } from "@/lib/db";
import { fireAutomationEvent } from "@/server/automationRunner";
import { pushBookingToCalendars } from "@/server/calendarSync";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { deliverToCustomer } from "@/server/deliver";
import { getAvailableSlots, isSlotStillAvailable } from "@/lib/availability";
import { toZonedDisplayDate, firstName } from "@/lib/utils";
import { addMinutes, format } from "date-fns";
import type { BookingStatus } from "@prisma/client";

export async function assignPartner(bookingId: string, membershipId: string | null, session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");

  if (membershipId) {
    const membership = await prisma.orgMembership.findFirst({ where: { id: membershipId, businessId: ctx.business.id, role: "PARTNER" } });
    if (!membership) throw new Error("not a partner in this organization");
  }

  // updateMany is the tenant-safe write, but it reports success having changed nothing when
  // the id belongs to another workspace. The caller is told instead.
  const changed = await prisma.booking.updateMany({
    where: { id: bookingId, businessId: ctx.business.id },
    data: { assignedMembershipId: membershipId },
  });
  if (changed.count === 0) throw new Error("That booking no longer exists.");
  revalidatePath(`/dashboard/bookings/${bookingId}`);
}

/** Which statuses a booking may move to from where it is. Anything can be canceled; nothing
 * moves backwards. DEPOSIT_PAID and BALANCE_PAID remain in the enum for older rows only. */
const LEGAL_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  INQUIRY: ["BOOKED", "CANCELED"],
  BOOKED: ["CONFIRMED", "CANCELED"],
  DEPOSIT_PAID: ["CONFIRMED", "CANCELED"],
  CONFIRMED: ["QUESTIONNAIRE_COMPLETE", "UPCOMING", "COMPLETED", "CANCELED"],
  QUESTIONNAIRE_COMPLETE: ["UPCOMING", "COMPLETED", "CANCELED"],
  UPCOMING: ["COMPLETED", "CANCELED"],
  COMPLETED: ["BALANCE_PAID", "FOLLOWED_UP"],
  BALANCE_PAID: ["FOLLOWED_UP"],
  FOLLOWED_UP: [],
  CANCELED: [],
};

export async function advanceBookingStatus(bookingId: string, status: BookingStatus, session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  const current = await prisma.booking.findFirst({ where: { id: bookingId, businessId: business.id }, select: { status: true } });
  if (!current) throw new Error("not found");
  if (!LEGAL_TRANSITIONS[current.status].includes(status)) {
    throw new Error(`A booking can't go from ${current.status.toLowerCase().replaceAll("_", " ")} to ${status.toLowerCase().replaceAll("_", " ")}.`);
  }

  await prisma.booking.updateMany({
    where: { id: bookingId, businessId: business.id },
    data: {
      status,
      confirmedAt: status === "CONFIRMED" ? new Date() : undefined,
      completedAt: status === "COMPLETED" ? new Date() : undefined,
    },
  });

  // Mirror the change on connected calendars (cancellation removes the mirror).
  await pushBookingToCalendars(bookingId).catch(() => {});

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
}

/**
 * Marks a completed booking as delivered with a real gallery link (Pixieset, Google Drive,
 * Dropbox — however this business actually hands off photos). There's no file storage of
 * our own; this persists a real URL + timestamp against the booking, same as any other
 * field on it.
 */
export async function markDelivered(bookingId: string, url: string, note: string | undefined) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, businessId: ctx.business.id } });
  if (!booking) throw new Error("not found");

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      deliveryUrl: url,
      deliveryNote: note || null,
      deliveredAt: new Date(),
      status: booking.status === "CANCELED" ? booking.status : "COMPLETED",
      completedAt: booking.completedAt ?? new Date(),
    },
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/portal");
}

export async function sendQuestionnaire(bookingId: string, session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, businessId: business.id },
    include: { client: true, conversation: true, service: true },
  });
  if (!booking) throw new Error("not found");

  if (!booking.conversation) throw new Error("There's no conversation with this person to send it on.");
  const body = `Hi ${firstName(booking.client.name)}! Ahead of your ${booking.service.name} session, please fill out this quick questionnaire so we can make the most of it.`;
  const lastInbound = await prisma.message.findFirst({ where: { conversationId: booking.conversation.id, direction: "INBOUND" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, providerMessageId: true } });
  const delivery = await deliverToCustomer({ businessId: business.id, businessName: business.name, businessHandle: business.handle, channel: booking.conversation.channel, to: booking.conversation.externalHandle, body, subject: `${business.name}: a quick questionnaire`, inReplyTo: booking.conversation.channel === "EMAIL" ? lastInbound?.providerMessageId ?? null : null, lastInboundAt: lastInbound?.createdAt ?? null }).catch(() => ({ status: "FAILED" as const, via: "none" as const, error: "Send failed" }));
  await prisma.message.create({ data: { conversationId: booking.conversation.id, direction: "OUTBOUND", body, status: delivery.status, statusDetail: (delivery as { statusDetail?: string }).statusDetail, sentByUserId: ctx.session.userId, providerMessageId: (delivery as { providerMessageId?: string }).providerMessageId } });
  if (delivery.status !== "SENT") throw new Error(delivery.error ?? "It couldn't be delivered on this channel. Nothing was marked as sent.");
  // Stamped only once it actually left, so "Questionnaire sent" is never a claim.
  await prisma.questionnaire.upsert({ where: { bookingId }, create: { bookingId, sentAt: new Date() }, update: { sentAt: new Date() } });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
}

// ── Reschedule and cancel ────────────────────────────────────────────────────

/** Bookable slots for the staff-side reschedule picker: the booking's own time is not
 * counted as busy, so the current slot can be kept or moved freely. */
export async function getRescheduleSlots(bookingId: string, dateISO: string, session?: SessionPayload | null): Promise<Array<{ start: string; end: string }>> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, businessId: ctx.business.id }, include: { service: true } });
  if (!booking) throw new Error("not found");
  const day = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(day.getTime())) return [];
  const slots = await getAvailableSlots(ctx.business.id, day, booking.service.durationMins, { excludeBookingId: booking.id });
  return slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }));
}

/**
 * Moves a booking. The new slot is checked against working hours, other bookings, buffers
 * and connected-calendar busy time under the business row lock, so two reschedules (or a
 * reschedule racing a public booking) cannot both take the same time. Mirrors on Google /
 * Apple are updated in place, and the customer is told on their conversation's channel
 * when one exists — honestly recorded as not delivered if that channel isn't connected.
 */
export async function rescheduleBooking(bookingId: string, startISO: string, opts: { notify?: boolean } = {}, session?: SessionPayload | null): Promise<{ ok: true; startAt: string; notified: "sent" | "not_delivered" | "no_channel" | "skipped" } | { ok: false; error: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return { ok: false, error: "Pick a time from the list." };
  if (start < new Date()) return { ok: false, error: "That time has already passed." };

  const outcome = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${business.id} FOR UPDATE`;
      const booking = await tx.booking.findFirst({ where: { id: bookingId, businessId: business.id }, include: { service: true, client: true } });
      if (!booking) return { error: "That booking doesn't exist in this workspace." };
      if (booking.status === "CANCELED" || booking.status === "COMPLETED" || booking.status === "BALANCE_PAID" || booking.status === "FOLLOWED_UP") return { error: "This booking is finished; create a new one instead." };
      const end = addMinutes(start, booking.service.durationMins);
      const free = await isSlotStillAvailable(business.id, start, end, { excludeBookingId: booking.id });
      if (!free) return { error: "That time isn't available — it's outside working hours, already booked, or busy on a connected calendar." };
      const previous = booking.startAt;
      await tx.booking.update({ where: { id: booking.id }, data: { startAt: start, endAt: end } });
      await tx.auditLog.create({ data: { businessId: business.id, action: "booking_rescheduled", targetType: "booking", targetId: booking.id, metadata: { from: previous.toISOString(), to: start.toISOString() } } });
      return { booking: { ...booking, startAt: start, endAt: end }, previous };
    },
    { timeout: 15_000 }
  );
  if ("error" in outcome && outcome.error) return { ok: false, error: outcome.error };
  if (!("booking" in outcome) || !outcome.booking) return { ok: false, error: "Couldn't reschedule this booking." };

  // Calendar mirrors move with it; a failure there is recorded on the integration, never hidden.
  await pushBookingToCalendars(bookingId).catch(() => {});

  let notified: "sent" | "not_delivered" | "no_channel" | "skipped" = "skipped";
  if (opts.notify !== false) {
    const conversation = await prisma.conversation.findFirst({ where: { businessId: business.id, clientId: outcome.booking.clientId, archived: false }, orderBy: { lastMessageAt: "desc" } });
    const channel = conversation?.channel ?? (outcome.booking.client.email ? "EMAIL" : outcome.booking.client.phone ? "SMS" : null);
    const to = conversation?.externalHandle ?? outcome.booking.client.email ?? outcome.booking.client.phone ?? null;
    if (channel && to) {
      const when = toZonedDisplayDate(start, business.timezone);
      const body = `Hi ${firstName(outcome.booking.client.name)} — your ${outcome.booking.service.name} with ${business.name} has moved to ${format(when, "EEEE, MMMM d")} at ${format(when, "h:mm a")}. Reply here if that doesn't work.`;
      const lastInbound = conversation ? await prisma.message.findFirst({ where: { conversationId: conversation.id, direction: "INBOUND" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }) : null;
      const delivery = await deliverToCustomer({ businessId: business.id, businessName: business.name, businessHandle: business.handle, channel, to, body, subject: `${business.name}: your booking has moved`, lastInboundAt: lastInbound?.createdAt ?? null }).catch(() => ({ status: "FAILED" as const, via: "none" as const, error: "Send failed" }));
      const conversationId = conversation?.id ?? (await prisma.conversation.create({ data: { businessId: business.id, clientId: outcome.booking.clientId, channel, externalHandle: to, lastMessageAt: new Date(), category: "PRIORITY", categoryReason: "Existing customer.", categorySource: "rules" } })).id;
      await prisma.message.create({ data: { conversationId, direction: "OUTBOUND", body, status: delivery.status, sentByUserId: ctx.session.userId, providerMessageId: (delivery as { providerMessageId?: string }).providerMessageId } });
      notified = delivery.status === "SENT" ? "sent" : "not_delivered";
    } else {
      notified = "no_channel";
    }
  }

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
  return { ok: true, startAt: start.toISOString(), notified };
}

/** Cancels a booking: status only — messages and the client are untouched; the
 * calendar mirror is removed. Returns rather than throws so the UI can say why. */
export async function cancelBooking(bookingId: string, session?: SessionPayload | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  const current = await prisma.booking.findFirst({ where: { id: bookingId, businessId: ctx.business.id }, select: { status: true } });
  if (!current) return { ok: false, error: "That booking doesn't exist in this workspace." };
  if (!LEGAL_TRANSITIONS[current.status].includes("CANCELED")) return { ok: false, error: "This booking can't be canceled from its current state." };
  await prisma.booking.updateMany({ where: { id: bookingId, businessId: ctx.business.id }, data: { status: "CANCELED" } });
  await prisma.auditLog.create({ data: { businessId: ctx.business.id, action: "booking_canceled", targetType: "booking", targetId: bookingId } });
  await pushBookingToCalendars(bookingId).catch(() => {});
  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
  return { ok: true };
}
