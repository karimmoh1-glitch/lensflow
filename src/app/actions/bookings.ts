"use server";

import { prisma } from "@/lib/db";
import { markPaymentPaidAndAdvanceBooking } from "@/server/payments";
import { fireAutomationEvent } from "@/server/automationRunner";
import { pushBookingToCalendars } from "@/server/calendarSync";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { requireClientRecord } from "./portal";
import { revalidatePath } from "next/cache";
import { createCardCheckout, stripeIsLive } from "@/lib/payments";
import { sendOnChannel } from "@/lib/messaging";
import { deliverToCustomer } from "@/server/deliver";
import { getAvailableSlots, isSlotStillAvailable } from "@/lib/availability";
import { toZonedDisplayDate } from "@/lib/utils";
import { addMinutes, format } from "date-fns";
import type { BookingStatus, PaymentMethodType, PaymentPurpose } from "@prisma/client";

export async function assignPartner(bookingId: string, membershipId: string | null) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");

  if (membershipId) {
    const membership = await prisma.orgMembership.findFirst({ where: { id: membershipId, businessId: ctx.business.id, role: "PARTNER" } });
    if (!membership) throw new Error("not a partner in this organization");
  }

  await prisma.booking.updateMany({
    where: { id: bookingId, businessId: ctx.business.id },
    data: { assignedMembershipId: membershipId },
  });
  revalidatePath(`/dashboard/bookings/${bookingId}`);
}

/** Which statuses a booking may move to from where it is. Anything can be canceled; nothing
 * moves backwards or skips the money steps. */
const LEGAL_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  INQUIRY: ["BOOKED", "CANCELED"],
  BOOKED: ["DEPOSIT_PAID", "CONFIRMED", "CANCELED"],
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
  revalidatePath("/dashboard");
}

export async function requestPayment(params: {
  bookingId: string;
  purpose: PaymentPurpose;
  method: PaymentMethodType;
  amountCents: number;
}) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  const booking = await prisma.booking.findFirst({
    where: { id: params.bookingId, businessId: business.id },
    include: { client: true, service: true },
  });
  if (!booking) throw new Error("not found");

  const reference =
    params.method === "ZELLE" || params.method === "BANK_TRANSFER" ? `LF-${booking.id.slice(-6).toUpperCase()}` : null;

  const payment = await prisma.payment.create({
    data: {
      businessId: business.id,
      bookingId: booking.id,
      clientId: booking.clientId,
      method: params.method,
      purpose: params.purpose,
      amountCents: params.amountCents,
      status: "AWAITING_CONFIRMATION",
      reference,
    },
  });

  let checkoutUrl: string | null = null;

  if (params.method === "CARD") {
    const result = await createCardCheckout({
      amountCents: params.amountCents,
      description: `${params.purpose === "DEPOSIT" ? "Deposit for" : "Balance for"} ${booking.service.name}`,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings/${booking.id}`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings/${booking.id}`,
      metadata: { bookingId: booking.id, businessId: business.id, paymentId: payment.id },
    customerEmail: booking.client.email, });
    checkoutUrl = result.url;
  }

  revalidatePath(`/dashboard/bookings/${booking.id}`);
  revalidatePath("/dashboard/payments");
  return { paymentId: payment.id, checkoutUrl, reference };
}

/**
 * Staff-only manual confirmation — this is how a photographer marks a Zelle/bank transfer
 * (or a card payment) as received. A client or partner must never be able to call this:
 * it would let them mark their own unpaid balance as paid without money changing hands.
 */
export async function confirmPayment(paymentId: string, session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  await markPaymentPaidAndAdvanceBooking(paymentId, ctx.business.id);
}

/**
 * Stands in for a payment-gateway webhook completing a card checkout. Deliberately
 * narrower than confirmPayment: only ever touches CARD payments, so it can never be used
 * to rubber-stamp a Zelle/bank transfer that was never actually sent.
 *
 * Reachable by two callers, and only two: staff confirming on a client's behalf, or the
 * CLIENT who actually owns this specific payment (mirroring a real checkout redirect back
 * to them). Every other role/ownership combination — a PARTNER, or a CLIENT hitting a
 * different client's paymentId — must be rejected. There is no proof-of-payment check here
 * (this stands in for a webhook), so a broad "any org member" trust boundary would let a
 * client mark their own or someone else's invoice paid without money changing hands.
 */
export async function completeCardCheckout(paymentId: string, session?: SessionPayload | null) {
  // When Stripe is configured, a card payment is only ever marked paid by the signature-
  // verified webhook. This simulated path exists for deployments without a key.
  if (stripeIsLive) throw new Error("Card payments are confirmed by Stripe, not by this page.");
  const staffCtx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (staffCtx) {
    const payment = await prisma.payment.findFirst({ where: { id: paymentId, businessId: staffCtx.business.id, method: "CARD" } });
    if (!payment) throw new Error("not found");
    await markPaymentPaidAndAdvanceBooking(paymentId, staffCtx.business.id);
    return;
  }

  const clientCtx = await requireClientRecord(session);
  if (!clientCtx) throw new Error("unauthorized");
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, businessId: clientCtx.business.id, clientId: clientCtx.client.id, method: "CARD" },
  });
  if (!payment) throw new Error("not found");
  await markPaymentPaidAndAdvanceBooking(paymentId, clientCtx.business.id);
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

export async function sendQuestionnaire(bookingId: string) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, businessId: business.id },
    include: { client: true, conversation: true, service: true },
  });
  if (!booking) throw new Error("not found");

  await prisma.questionnaire.upsert({
    where: { bookingId },
    create: { bookingId, sentAt: new Date() },
    update: { sentAt: new Date() },
  });

  if (booking.conversation) {
    await sendOnChannel({
      channel: booking.conversation.channel,
      to: booking.conversation.externalHandle,
      body: `Hi ${booking.client.name}! Ahead of your ${booking.service.name} session, please fill out this quick questionnaire so we can make the most of it.`,
    });
  }

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
      const body = `Hi ${outcome.booking.client.name.split(" ")[0]} — your ${outcome.booking.service.name} with ${business.name} has moved to ${format(when, "EEEE, MMMM d")} at ${format(when, "h:mm a")}. Reply here if that doesn't work.`;
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

/** Cancels a booking: status only — payments, messages and the client are untouched; the
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
