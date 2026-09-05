import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Badge } from "@/components/ui";
import { formatMoney, cn } from "@/lib/utils";
import { PLANS, effectivePlan, type PlanKey } from "@/lib/billing";
import { subscriptionBillingIsLive, getBillingSnapshot } from "@/lib/subscriptionBilling";
import { PlanButton, ManageBillingButton, CheckoutReturn } from "./PlanActions";
import { format } from "date-fns";

const STATUS: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  ACTIVE: { tone: "success", label: "Active" },
  TRIALING: { tone: "success", label: "Trial" },
  PAST_DUE: { tone: "warning", label: "Payment failed — retrying" },
  CANCELED: { tone: "danger", label: "Canceled" },
  INCOMPLETE: { tone: "warning", label: "Payment incomplete" },
  INCOMPLETE_EXPIRED: { tone: "danger", label: "Checkout expired" },
  UNPAID: { tone: "danger", label: "Unpaid" },
};
const ORDER: PlanKey[] = ["FREE", "PRO", "BUSINESS"];

/**
 * What the business pays Daythread. Everything on this page is read from the database
 * (which only the Stripe webhook writes) and, when a customer exists, from Stripe itself:
 * the card on file, the next charge, recent invoices. Client deposits and balances are a
 * different thing and live under Payments.
 */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; plan?: string }> }) {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) redirect("/dashboard");
  const { business } = ctx;
  const sp = await searchParams;

  const current = effectivePlan(business);
  const plan = PLANS[current];
  const [seatCount, snapshot] = await Promise.all([
    prisma.orgMembership.count({ where: { businessId: business.id, role: { not: "CLIENT" }, status: "ACTIVE" } }),
    getBillingSnapshot(business),
  ]);
  const status = business.billingStatus ? STATUS[business.billingStatus] : null;
  const live = business.billingStatus && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(business.billingStatus);
  const pastDue = business.billingStatus === "PAST_DUE" || business.billingStatus === "UNPAID";
  const lapsed = business.planTier !== "FREE" && current === "FREE"; // paid tier on record, no longer entitled

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader title="Billing" description="What your business pays for Daythread." />

      {(sp.checkout === "success" || sp.checkout === "canceled") && (
        <CheckoutReturn outcome={sp.checkout} expectedPlan={sp.plan ?? null} currentPlan={current} />
      )}

      {!subscriptionBillingIsLive && (
        <div className="text-sm text-ink/70 bg-signal-soft/50 border border-signal/15 rounded-2xl px-4 py-3 mb-6 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Upgrades aren&apos;t open on this deployment yet — plans are shown for reference and nothing is charged.</span>
          {ctx.role === "OWNER" && (
            <Link href="/dashboard/billing/setup" className="text-signal-text font-semibold hover:underline">Owner setup guide →</Link>
          )}
        </div>
      )}

      {pastDue && (
        <div role="alert" className="mb-6 rounded-2xl border border-warning/40 bg-warning-soft/60 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 text-sm text-ink/80">
            <span className="font-semibold text-ink">Your last payment didn&rsquo;t go through.</span> Stripe will retry over the next few days and your plan stays on until then. Update your card to keep everything running.
          </div>
          <ManageBillingButton flow="payment_method" label="Update card" variant="primary" size="md" />
        </div>
      )}
      {lapsed && (
        <div role="alert" className="mb-6 rounded-2xl border border-danger/30 bg-danger-soft/50 px-4 py-3.5 text-sm text-ink/80">
          <span className="font-semibold text-ink">Your {PLANS[business.planTier].name} subscription has ended.</span> You&rsquo;re on Free now — nothing was deleted, but automations, AI and team features are paused until you choose a plan again.
        </div>
      )}

      {/* Current plan */}
      <section aria-label="Current plan" className="mb-8 rounded-[22px] border border-border bg-white overflow-hidden">
        <div className="px-5 md:px-6 py-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-sans font-extrabold text-[1.35rem] tracking-[-0.02em] text-ink">{plan.name}</h2>
              {status && <Badge tone={status.tone}>{status.label}</Badge>}
              {business.cancelAtPeriodEnd && live && <Badge tone="neutral">Cancels {business.currentPeriodEnd ? format(business.currentPeriodEnd, "MMM d") : "at period end"}</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink/60">{plan.tagline}</p>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <div className="font-sans font-extrabold text-2xl tracking-[-0.03em] text-ink tabular-nums">
              {plan.priceCents === 0 ? "Free" : formatMoney(plan.priceCents)}
              {plan.priceCents > 0 && <span className="text-sm font-medium text-ink/50"> / month</span>}
            </div>
            {business.stripeCustomerId && subscriptionBillingIsLive && <div className="mt-2"><ManageBillingButton /></div>}
          </div>
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border-t border-border">
          <Fact label={business.cancelAtPeriodEnd ? "Ends" : "Next charge"} value={live && business.currentPeriodEnd ? format(business.currentPeriodEnd, "MMM d, yyyy") : "—"} sub={live && business.stripeCustomerId && !business.cancelAtPeriodEnd ? formatMoney(snapshot?.nextInvoice?.amountCents ?? plan.priceCents) : undefined} />
          <Fact label="Payment method" value={snapshot?.paymentMethod ? `${cap(snapshot.paymentMethod.brand)} ···· ${snapshot.paymentMethod.last4}` : business.stripeCustomerId ? "None on file" : "—"} sub={snapshot?.paymentMethod ? `Expires ${String(snapshot.paymentMethod.expMonth).padStart(2, "0")}/${String(snapshot.paymentMethod.expYear).slice(-2)}` : undefined} tone={pastDue ? "warning" : undefined} />
          <Fact label="Seats" value={plan.maxTeamSeats === Infinity ? `${seatCount} used` : `${seatCount} of ${plan.maxTeamSeats}`} sub={plan.maxTeamSeats !== Infinity && seatCount > plan.maxTeamSeats ? "Over the limit — invites paused" : undefined} tone={plan.maxTeamSeats !== Infinity && seatCount > plan.maxTeamSeats ? "warning" : undefined} />
          <Fact label="Billing" value={business.stripeCustomerId ? "Through Stripe" : "Not started"} sub={business.stripeCustomerId ? "Card, invoices and cancellation in the portal" : undefined} />
        </dl>
      </section>

      {/* Plans */}
      <section aria-label="Plans" className="mb-8">
        <div className="grid sm:grid-cols-3 gap-3 md:gap-4 items-stretch">
          {ORDER.map((key) => {
            const p = PLANS[key];
            const isCurrent = key === current;
            const rank = ORDER.indexOf(key);
            const currentRank = ORDER.indexOf(current);
            const label = isCurrent ? "Current plan" : key === "FREE" ? null : rank > currentRank ? `Upgrade to ${p.name}` : `Switch to ${p.name}`;
            return (
              <div key={key} className={cn("rounded-[22px] border bg-white p-5 flex flex-col transition-colors", isCurrent ? "border-ink shadow-[0_18px_44px_-28px_rgba(16,17,20,0.5)]" : "border-border")}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-sans font-extrabold text-lg tracking-tight text-ink">{p.name}</h3>
                  {isCurrent && <Badge tone="accent">Current</Badge>}
                </div>
                <div className="mt-2 font-sans font-extrabold text-2xl tracking-[-0.03em] text-ink tabular-nums">
                  {p.priceCents === 0 ? "Free" : formatMoney(p.priceCents)}
                  {p.priceCents > 0 && <span className="text-sm font-medium text-ink/50"> / mo</span>}
                </div>
                <p className="mt-1 text-sm font-semibold text-ink">{p.tagline}</p>
                <p className="mt-1 text-xs text-ink/55 leading-relaxed">{p.outcome}</p>
                <ul className="mt-4 space-y-1.5 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="text-xs text-ink/70 flex items-start gap-1.5">
                      <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  {label && !isCurrent && key !== "FREE" && subscriptionBillingIsLive && <PlanButton planKey={key as "PRO" | "BUSINESS"} label={label} variant={rank > currentRank ? "primary" : "outline"} />}
                  {label && !isCurrent && key !== "FREE" && !subscriptionBillingIsLive && <p className="text-xs text-ink/50">Available once billing opens.</p>}
                  {isCurrent && <p className="text-xs text-ink/50">{key === "FREE" ? "No card on file." : business.cancelAtPeriodEnd ? "Cancels at the end of the period." : "Renews monthly."}</p>}
                  {!isCurrent && key === "FREE" && business.stripeCustomerId && live && <p className="text-xs text-ink/50">To go back to Free, cancel from Manage billing. You keep your plan until the period ends.</p>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink/45">Prices in USD, billed monthly, cancel anytime. Plan changes are prorated by Stripe.</p>
      </section>

      {/* History */}
      {snapshot && snapshot.invoices.length > 0 && (
        <section aria-label="Invoices" className="rounded-[22px] border border-border bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border text-[11px] font-bold uppercase tracking-[0.14em] text-ink/45">Invoices</div>
          <ul className="divide-y divide-border">
            {snapshot.invoices.map((inv) => (
              <li key={inv.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                <span className="text-ink/60 tabular-nums w-28 shrink-0">{format(inv.at, "MMM d, yyyy")}</span>
                <span className="flex-1 min-w-0 truncate text-ink">{inv.number ?? "Invoice"}</span>
                <Badge tone={inv.status === "paid" ? "success" : inv.status === "open" ? "warning" : "neutral"}>{inv.status}</Badge>
                <span className="font-semibold text-ink tabular-nums w-20 text-right">{formatMoney(inv.amountCents)}</span>
                {inv.url && <a href={inv.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-ink/55 hover:text-ink">View</a>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Fact({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warning" }) {
  return (
    <div className="bg-white px-5 py-3.5">
      <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/45">{label}</dt>
      <dd className={cn("mt-1 text-sm font-semibold", tone === "warning" ? "text-warning-text" : "text-ink")}>{value}</dd>
      {sub && <dd className="text-[11px] text-ink/50 mt-0.5">{sub}</dd>}
    </div>
  );
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
