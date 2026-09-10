import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listPayments } from "@/server/payments";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { formatMoney, cn } from "@/lib/utils";
import { format } from "date-fns";
import { ChevronRight, CreditCard } from "lucide-react";
import type { PaymentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Money in, as the business's own records have it. Every row came from the business's
 * connected Stripe account; Daythread records what happened and never creates a charge.
 * Nothing here is estimated or projected.
 */
const STATUS: Record<PaymentStatus, { tone: "neutral" | "success" | "warning" | "danger"; label: string }> = {
  PAID: { tone: "success", label: "Paid" },
  AWAITING_CONFIRMATION: { tone: "warning", label: "Pending" },
  FAILED: { tone: "danger", label: "Failed" },
  REFUNDED: { tone: "neutral", label: "Refunded" },
};

const FILTERS: Array<{ key: "all" | PaymentStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "PAID", label: "Paid" },
  { key: "AWAITING_CONFIRMATION", label: "Pending" },
  { key: "REFUNDED", label: "Refunded" },
  { key: "FAILED", label: "Failed" },
];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;
  const sp = await searchParams;
  const status = (FILTERS.find((f) => f.key === sp.status)?.key ?? "all") as "all" | PaymentStatus;

  const [view, stripe] = await Promise.all([
    listPayments(business.id, { status }),
    prisma.integration.findUnique({ where: { businessId_provider: { businessId: business.id, provider: "STRIPE" } }, select: { status: true, externalAccount: true } }),
  ]);
  const connected = Boolean(stripe && stripe.status !== "NOT_CONNECTED");
  const { rows, totals } = view;

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-5xl">
      <PageHeader title="Payments" description={connected ? `Recorded from your Stripe account${stripe?.externalAccount ? ` · ${stripe.externalAccount}` : ""}.` : "What your clients have paid you."} />

      {totals.count > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Tile label="Collected" value={formatMoney(totals.collectedCents)} tone="text-success-text" />
          <Tile label="Pending" value={formatMoney(totals.pendingCents)} tone="text-warning-text" />
          <Tile label="Refunded" value={formatMoney(totals.refundedCents)} tone="text-ink/70" />
          <Tile label="Payments" value={String(totals.count)} tone="text-ink" />
        </div>
      )}

      {totals.count > 0 && (
        <div className="flex items-center gap-1 mb-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/dashboard/payments" : `/dashboard/payments?status=${f.key}`}
              aria-current={status === f.key ? "page" : undefined}
              className={cn("h-8 px-3.5 rounded-full text-[13px] font-semibold inline-flex items-center whitespace-nowrap transition-colors", status === f.key ? "bg-ink text-white" : "text-ink/70 hover:text-ink hover:bg-black/[0.04]")}
            >
              {f.label}
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={totals.count === 0 ? "No payments yet." : "Nothing with that status."}
          description={
            totals.count > 0
              ? "Try another filter."
              : connected
                ? "When someone pays you through Stripe, the payment appears here against the person who paid, with what it was for."
                : "Connect Stripe and every payment your clients make is recorded here against the right person, with what it was for. Your money goes to your own Stripe account — Daythread only reads what happened."
          }
          action={
            totals.count === 0 && !connected ? (
              <Link href="/dashboard/settings?tab=channels" className="inline-flex items-center h-9 px-4 rounded-full bg-ink text-white text-sm font-semibold">
                Connect Stripe
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => {
            const s = STATUS[p.status];
            const when = p.paidAt ?? p.createdAt;
            return (
              <li key={p.id}>
                <div className="rounded-2xl border border-border bg-white px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className="shrink-0 w-9 h-9 rounded-xl border border-border bg-paper hidden sm:flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-ink/60" strokeWidth={2} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.client ? (
                        <Link href={`/dashboard/clients/${p.client.id}`} className="text-[15px] font-semibold text-ink hover:underline truncate">
                          {p.client.name}
                        </Link>
                      ) : (
                        <span className="text-[15px] font-semibold text-ink">Someone</span>
                      )}
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink/65 truncate">
                      {p.booking ? (
                        <>
                          {p.booking.service} · {format(p.booking.startAt, "MMM d, yyyy")}
                        </>
                      ) : (
                        <>{p.purpose.toLowerCase().replace(/_/g, " ")} · {p.method.toLowerCase().replace(/_/g, " ")}</>
                      )}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </p>
                  </div>
                  <div className="sm:text-right shrink-0">
                    <div className={cn("text-[15px] font-semibold tabular-nums", p.status === "REFUNDED" ? "text-ink/50 line-through" : "text-ink")}>{formatMoney(p.amountCents)}</div>
                    <div className="text-[11px] text-ink/60">{format(when, "MMM d, yyyy")}</div>
                  </div>
                  {p.booking && (
                    <Link href={`/dashboard/bookings/${p.booking.id}`} aria-label="Open booking" className="hidden sm:inline-flex text-ink/40 hover:text-ink">
                      <ChevronRight className="w-4 h-4" strokeWidth={2} />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {view.hasMore && <p className="mt-4 text-[12px] text-ink/60">Showing the most recent {rows.length}. Older payments stay in Stripe.</p>}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/60">{label}</div>
      <div className={cn("mt-1 text-[1.35rem] font-extrabold tracking-[-0.02em] tabular-nums", tone)}>{value}</div>
    </div>
  );
}
