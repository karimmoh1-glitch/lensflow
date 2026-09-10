import { prisma } from "@/lib/db";
import type { PaymentStatus } from "@prisma/client";

/**
 * What the business has actually been paid, read from its own records. Payments arrive from
 * the business's connected Stripe account (src/server/stripeConnectEvents.ts) — Daythread
 * never creates a charge, and nothing here invents a payment that did not happen.
 *
 * Every query is scoped by businessId, so one workspace can never read another's money.
 */
export type PaymentRow = {
  id: string;
  amountCents: number;
  status: PaymentStatus;
  method: string;
  purpose: string;
  reference: string | null;
  /** Stripe's payment intent, shown so a business can find the charge in Stripe. Not a secret. */
  externalId: string | null;
  paidAt: Date | null;
  createdAt: Date;
  client: { id: string; name: string } | null;
  booking: { id: string; startAt: Date; service: string } | null;
};

export type PaymentTotals = { collectedCents: number; pendingCents: number; refundedCents: number; failed: number; count: number };

export type PaymentsView = { rows: PaymentRow[]; totals: PaymentTotals; hasMore: boolean };

const PAGE = 100;

export async function listPayments(businessId: string, opts: { status?: PaymentStatus | "all"; clientId?: string; take?: number } = {}): Promise<PaymentsView> {
  const take = Math.min(Math.max(opts.take ?? PAGE, 1), 300);
  const where = {
    businessId,
    ...(opts.status && opts.status !== "all" ? { status: opts.status } : {}),
    ...(opts.clientId ? { clientId: opts.clientId } : {}),
  };
  const [found, all] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }],
      take: take + 1,
      select: {
        id: true, amountCents: true, status: true, method: true, purpose: true, reference: true,
        stripePaymentIntentId: true, confirmedAt: true, createdAt: true,
        client: { select: { id: true, name: true } },
        booking: { select: { id: true, startAt: true, service: { select: { name: true } } } },
      },
    }),
    // Totals cover the whole workspace, not the current page, so the summary is the truth.
    prisma.payment.findMany({ where: { businessId, ...(opts.clientId ? { clientId: opts.clientId } : {}) }, select: { amountCents: true, status: true } }),
  ]);
  const hasMore = found.length > take;
  const rows: PaymentRow[] = found.slice(0, take).map((p) => ({
    id: p.id,
    amountCents: p.amountCents,
    status: p.status,
    method: p.method,
    purpose: p.purpose,
    reference: p.reference,
    externalId: p.stripePaymentIntentId,
    paidAt: p.confirmedAt,
    createdAt: p.createdAt,
    client: p.client ? { id: p.client.id, name: p.client.name } : null,
    booking: p.booking ? { id: p.booking.id, startAt: p.booking.startAt, service: p.booking.service.name } : null,
  }));
  const totals = all.reduce<PaymentTotals>(
    (acc, p) => {
      acc.count++;
      if (p.status === "PAID") acc.collectedCents += p.amountCents;
      else if (p.status === "AWAITING_CONFIRMATION") acc.pendingCents += p.amountCents;
      else if (p.status === "REFUNDED") acc.refundedCents += p.amountCents;
      else if (p.status === "FAILED") acc.failed++;
      return acc;
    },
    { collectedCents: 0, pendingCents: 0, refundedCents: 0, failed: 0, count: 0 }
  );
  return { rows, totals, hasMore };
}
