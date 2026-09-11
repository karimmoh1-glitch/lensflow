import { prisma } from "@/lib/db";
import type { PaymentStatus, Prisma } from "@prisma/client";

/**
 * What the business has actually been paid, read from its own records. Payments arrive from
 * the business's connected Stripe account (src/server/stripeConnectEvents.ts) — Daythread
 * never creates a charge, and nothing here invents a payment that did not happen.
 *
 * Every query is scoped by businessId, so one workspace can never read another's money.
 * Totals are aggregated in the database rather than by loading every row, and they are kept
 * per currency: adding euros to dollars would produce a number that is simply wrong.
 */
export type PaymentRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  method: string;
  purpose: string;
  reference: string | null;
  /** Stripe's payment intent, so a business can find the charge in Stripe. Not a secret. */
  externalId: string | null;
  paidAt: Date | null;
  createdAt: Date;
  client: { id: string; name: string } | null;
  booking: { id: string; startAt: Date; service: string } | null;
};

export type CurrencyTotals = { currency: string; collectedCents: number; pendingCents: number; refundedCents: number; failed: number; count: number };

export type PaymentsView = {
  rows: PaymentRow[];
  /** Most-used currency first, so the page can lead with the one that matters. */
  totals: CurrencyTotals[];
  count: number;
  /** Only the statuses this workspace actually has, so the UI never offers a dead filter. */
  statuses: PaymentStatus[];
  hasMore: boolean;
};

const PAGE = 100;

export async function listPayments(businessId: string, opts: { status?: PaymentStatus | "all"; clientId?: string; take?: number } = {}): Promise<PaymentsView> {
  const take = Math.min(Math.max(opts.take ?? PAGE, 1), 300);
  const scope: Prisma.PaymentWhereInput = { businessId, ...(opts.clientId ? { clientId: opts.clientId } : {}) };
  const where: Prisma.PaymentWhereInput = { ...scope, ...(opts.status && opts.status !== "all" ? { status: opts.status } : {}) };

  const [found, grouped] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }],
      take: take + 1,
      select: {
        id: true, amountCents: true, currency: true, status: true, method: true, purpose: true, reference: true,
        stripePaymentIntentId: true, confirmedAt: true, createdAt: true,
        client: { select: { id: true, name: true } },
        booking: { select: { id: true, startAt: true, service: { select: { name: true } } } },
      },
    }),
    // Aggregated in the database: the summary covers the whole workspace without loading it.
    prisma.payment.groupBy({ by: ["currency", "status"], where: scope, _sum: { amountCents: true }, _count: { _all: true } }),
  ]);

  const hasMore = found.length > take;
  const rows: PaymentRow[] = found.slice(0, take).map((p) => ({
    id: p.id,
    amountCents: p.amountCents,
    currency: p.currency,
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

  const byCurrency = new Map<string, CurrencyTotals>();
  const statuses = new Set<PaymentStatus>();
  let count = 0;
  for (const g of grouped) {
    const n = g._count._all;
    const sum = g._sum.amountCents ?? 0;
    count += n;
    statuses.add(g.status);
    const t = byCurrency.get(g.currency) ?? { currency: g.currency, collectedCents: 0, pendingCents: 0, refundedCents: 0, failed: 0, count: 0 };
    t.count += n;
    if (g.status === "PAID") t.collectedCents += sum;
    else if (g.status === "AWAITING_CONFIRMATION") t.pendingCents += sum;
    else if (g.status === "REFUNDED") t.refundedCents += sum;
    else if (g.status === "FAILED") t.failed += n;
    byCurrency.set(g.currency, t);
  }
  const totals = [...byCurrency.values()].sort((a, b) => b.count - a.count);
  const ORDER: PaymentStatus[] = ["PAID", "AWAITING_CONFIRMATION", "REFUNDED", "FAILED"];
  return { rows, totals, count, statuses: ORDER.filter((s) => statuses.has(s)), hasMore };
}
