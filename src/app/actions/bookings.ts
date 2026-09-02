"use server";

import { prisma } from "@/lib/db";
import { requireBusiness, requireRole, type SessionPayload } from "@/lib/auth";
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

export async function advanceBookingStatus(bookingId: string, status: BookingStatus, session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

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

async function markPaymentPaidAndAdvanceBooking(paymentId: string, businessId: string) {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, businessId }, include: { booking: true } });
  if (!payment) throw new Error("not found");
  if (payment.status === "PAID") return;

  await prisma.payment.update({ where: { id: paymentId }, data: { status: "PAID", confirmedAt: new Date() } });

  if (payment.booking) {
    const nextStatus: BookingStatus | null =
      payment.purpose === "DEPOSIT" ? "DEPOSIT_PAID" : payment.purpose === "BALANCE" || payment.purpose === "FULL" ? "BALANCE_PAID" : null;
    if (nextStatus) {
      await prisma.booking.update({ where: { id: payment.booking.id }, data: { status: nextStatus } });
    }
  }

  revalidatePath("/dashboard/payments");
  if (payment.bookingId) revalidatePath(`/dashboard/bookings/${payment.bookingId}`);
  revalidatePath("/dashboard");
  revalidatePath("/portal");
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
 * to rubber-stamp a Zelle/bank transfer that was never actually sent. Any authenticated
 * org member can trigger it (mirrors a real checkout redirect), but the method check keeps
 * the manual-confirmation trust boundary intact.
 */
export async function completeCardCheckout(paymentId: string) {
  const ctx = await requireBusiness();
  if (!ctx) throw new Error("unauthorized");
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, businessId: ctx.business.id, method: "CARD" } });
  if (!payment) throw new Error("not found");
  await markPaymentPaidAndAdvanceBooking(paymentId, ctx.business.id);
}

/**
 * Marks a completed shoot as delivered with a real gallery link (Pixieset, Google Drive,
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
