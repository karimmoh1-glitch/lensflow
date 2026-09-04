import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { BookingStatus } from "@prisma/client";
import { fireAutomationEvent } from "@/server/automationRunner";
import { track } from "@/lib/analytics";

/**
 * The one place a payment becomes PAID. Shared by staff confirmation (Zelle / bank
 * transfer), the simulated card checkout, and the Stripe webhook for real card checkouts.
 * Advances the booking with it and lets the automation runner know money arrived.
 * Idempotent: a payment already marked PAID is left alone.
 */
export async function markPaymentPaidAndAdvanceBooking(paymentId: string, businessId: string, opts: { stripePaymentIntentId?: string | null } = {}) {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, businessId }, include: { booking: true } });
  if (!payment) throw new Error("not found");
  if (payment.status === "PAID") return;

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "PAID", confirmedAt: new Date(), ...(opts.stripePaymentIntentId ? { stripePaymentIntentId: opts.stripePaymentIntentId } : {}) },
  });

  if (payment.booking) {
    const nextStatus: BookingStatus | null =
      payment.purpose === "DEPOSIT" ? "DEPOSIT_PAID" : payment.purpose === "BALANCE" || payment.purpose === "FULL" ? "BALANCE_PAID" : null;
    if (nextStatus) {
      await prisma.booking.update({ where: { id: payment.booking.id }, data: { status: nextStatus } });
    }
  }

  const paidBefore = await prisma.payment.count({ where: { businessId, status: "PAID", id: { not: paymentId } } });
  if (paidBefore === 0) await track("first_payment_created", { businessId, properties: { amountCents: payment.amountCents } });

  if (payment.purpose === "DEPOSIT" && payment.bookingId) {
    await fireAutomationEvent({ businessId, trigger: "DEPOSIT_PAID", targetType: "booking", targetId: payment.bookingId });
  }

  revalidatePath("/dashboard/payments");
  if (payment.bookingId) revalidatePath(`/dashboard/bookings/${payment.bookingId}`);
  revalidatePath("/dashboard");
  revalidatePath("/portal");
}
