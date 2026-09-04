"use server";

import { prisma } from "@/lib/db";
import { markPaymentPaidAndAdvanceBooking } from "@/server/payments";
import { fireAutomationEvent } from "@/server/automationRunner";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { requireClientRecord } from "./portal";
import { revalidatePath } from "next/cache";
import { createCardCheckout } from "@/lib/payments";
import { sendOnChannel } from "@/lib/messaging";
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
    });
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
