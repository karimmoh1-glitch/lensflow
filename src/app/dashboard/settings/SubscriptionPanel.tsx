import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui";
import { formatMoney, cn } from "@/lib/utils";
import { PLANS, effectivePlan, VISIBLE_PLANS, PLAN_ORDER, limitLabel, type PlanKey } from "@/lib/billing";
import { usageFor } from "@/server/integrationQuota";
import { subscriptionBillingIsLive, getBillingSnapshot } from "@/lib/subscriptionBilling";
import { PlanButton, ManageBillingButton, CheckoutReturn } from "@/app/dashboard/billing/PlanActions";
import { MobileUpgradeBar } from "@/app/dashboard/billing/MobileUpgradeBar";
import { format } from "date-fns";
import type { Business } from "@prisma/client";

const STATUS: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  ACTIVE: { tone: "success", label: "Active" },
  TRIALING: { tone: "success", label: "Trial" },
  PAST_DUE: { tone: "warning", label: "Payment failed — retrying" },
  CANCELED: { tone: "danger", label: "Canceled" },
  INCOMPLETE: { tone: "warning", label: "Payment incomplete" },
  INCOMPLETE_EXPIRED: { tone: "danger", label: "Checkout expired" },
  UNPAID: { tone: "danger", label: "Unpaid" },
};

/**
 * Your Daythread subscription — the only payment anywhere in the product. Everything here
 * is read from the database (which only the Stripe webhook writes) and, when a customer
 * exists, from Stripe itself: the card on file, the next charge, recent invoices. Free sees
 * where it stands and what Pro and Business unlock, not a billing dashboard.
 */
export async function SubscriptionPanel({ business, role, checkout, plan: expectedPlan }: { business: Business; role: string; checkout?: string; plan?: string }) {
  const current = effectivePlan(business);
  const plan = PLANS[current];
  const canBill = role === "OWNER" || role === "ADMIN";
  const [seatCount, snapshot, integrationRows, automationsOn] = await Promise.all([
    prisma.orgMembership.count({ where: { businessId: business.id, role: { not: "CLIENT" }, status: "ACTIVE" } }),
    getBillingSnapshot(business),
    prisma.integration.findMany({ where: { businessId: business.id }, select: { provider: true, status: true } }),
    prisma.automation.count({ where: { businessId: business.id, enabled: true } }),
  ]);
  const usage = usageFor(business, integrationRows);
  const seatsOver = plan.maxTeamSeats !== Infinity && seatCount > plan.maxTeamSeats;
  const automationsOver = Number.isFinite(plan.maxAutomations) && automationsOn > plan.maxAutomations;
  const status = business.billingStatus ? STATUS[business.billingStatus] : null;
  const live = business.billingStatus && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(business.billingStatus);
  const pastDue = business.billingStatus === "PAST_DUE" || business.billingStatus === "UNPAID";
  const lapsed = business.planTier !== "FREE" && current === "FREE";
  const paid = current !== "FREE";
  const currentRank = PLAN_ORDER.indexOf(current);
  const next = PLAN_ORDER[currentRank + 1] ?? null;

  return (
    <div className="dt-stagger">
      {(checkout === "success" || checkout === "canceled") && <CheckoutReturn outcome={checkout} expectedPlan={expectedPlan ?? null} currentPlan={current} />}

      {!subscriptionBillingIsLive && (
        <div className="text-sm text-ink/70 bg-signal-soft/50 border border-signal/15 rounded-2xl px-4 py-3 mb-6">
          Upgrades aren&apos;t open on this deployment yet — plans are shown for reference and nothing is charged.
        </div>
      )}
      {pastDue && (
        <div role="alert" className="mb-6 rounded-2xl border border-warning/40 bg-warning-soft/60 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 text-sm text-ink/80"><span className="font-semibold text-ink">Your last payment didn&rsquo;t go through.</span> Stripe will retry over the next few days and your plan stays on until then. Update your card to keep everything running.</div>
          {canBill && <ManageBillingButton flow="payment_method" label="Update card" variant="primary" size="md" />}
        </div>
      )}
      {lapsed && (
        <div role="alert" className="mb-6 rounded-2xl border border-danger/30 bg-danger-soft/50 px-4 py-3.5 text-sm text-ink/80">
          <span className="font-semibold text-ink">Your {PLANS[business.planTier].name} subscription has ended.</span> You&rsquo;re on Free now — nothing was deleted. Channels, automations and teammates above Free&rsquo;s limits are kept but paused for new additions until you choose a plan again.
        </div>
      )}
      {(usage.overQuota || seatsOver || automationsOver) && (
        <div role="alert" className="mb-6 rounded-2xl border border-warning/40 bg-warning-soft/60 px-4 py-3.5 text-sm text-ink/80 space-y-1">
          <div className="font-semibold text-ink">Over {plan.name}&rsquo;s limits — nothing was removed.</div>
          {usage.overQuota && <div>{usage.active} connected; {plan.name} includes {usage.limit}. All keep working; new connections are paused until you disconnect down to {usage.limit} or upgrade.</div>}
          {seatsOver && <div>{seatCount} people; {plan.name} includes {plan.maxTeamSeats}. Everyone keeps access; new invitations are paused.</div>}
          {automationsOver && <div>{automationsOn} automations on; {plan.name} runs {plan.maxAutomations}. The oldest {plan.maxAutomations} keep running; the rest are paused.</div>}
        </div>
      )}

      <section aria-label="Your Daythread subscription" className="mb-8 rounded-[22px] border border-border bg-white overflow-hidden">
        <div className="px-5 md:px-6 py-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45">Your Daythread subscription</p>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <h2 className="font-sans font-extrabold text-[1.35rem] tracking-[-0.02em] text-ink">Daythread {plan.name}</h2>
              {status && paid && <Badge tone={status.tone}>{status.label}</Badge>}
              {business.cancelAtPeriodEnd && live && <Badge tone="neutral">Cancels {business.currentPeriodEnd ? format(business.currentPeriodEnd, "MMM d") : "at period end"}</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink/60">{plan.tagline}</p>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <div className="font-sans font-extrabold text-2xl tracking-[-0.03em] text-ink tabular-nums">
              {plan.priceCents === 0 ? "Free" : formatMoney(plan.priceCents)}
              {plan.priceCents > 0 && <span className="text-sm font-medium text-ink/50"> / month</span>}
            </div>
            {paid && business.stripeCustomerId && subscriptionBillingIsLive && canBill && <div className="mt-2"><ManageBillingButton /></div>}
          </div>
        </div>
        {paid ? (
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border-t border-border">
            <Fact label={business.cancelAtPeriodEnd ? "Ends" : "Next charge"} value={live && business.currentPeriodEnd ? format(business.currentPeriodEnd, "MMM d, yyyy") : "—"} sub={live && business.stripeCustomerId && !business.cancelAtPeriodEnd ? formatMoney(snapshot?.nextInvoice?.amountCents ?? plan.priceCents) : undefined} />
            <Fact label="Payment method" value={snapshot?.paymentMethod ? `${cap(snapshot.paymentMethod.brand)} ···· ${snapshot.paymentMethod.last4}` : business.stripeCustomerId ? "None on file" : "—"} sub={snapshot?.paymentMethod ? `Expires ${String(snapshot.paymentMethod.expMonth).padStart(2, "0")}/${String(snapshot.paymentMethod.expYear).slice(-2)}` : undefined} tone={pastDue ? "warning" : undefined} />
            <Fact label="Connected" value={Number.isFinite(usage.limit) ? `${usage.active} of ${usage.limit}` : `${usage.active} · unlimited`} tone={usage.overQuota ? "warning" : undefined} />
            <Fact label="People" value={plan.maxTeamSeats === Infinity ? `${seatCount} · unlimited` : `${seatCount} of ${plan.maxTeamSeats}`} tone={seatsOver ? "warning" : undefined} />
          </dl>
        ) : (
          <dl className="grid grid-cols-3 gap-px bg-border border-t border-border">
            <Fact label="Connected" value={`${usage.active} of ${usage.limit}`} sub="channels and calendars" tone={usage.overQuota ? "warning" : undefined} />
            <Fact label="Automations" value={`${automationsOn} of ${limitLabel(plan.maxAutomations)}`} />
            <Fact label="People" value={`${seatCount} of ${plan.maxTeamSeats}`} />
          </dl>
        )}
      </section>

      <section aria-label="Plans" className="mb-8">
        <div className="grid sm:grid-cols-3 gap-3 md:gap-4 items-stretch">
          {VISIBLE_PLANS.map((key: PlanKey) => {
            const p = PLANS[key];
            const isCurrent = key === current;
            const rank = PLAN_ORDER.indexOf(key);
            const label = isCurrent ? null : key === "FREE" ? null : rank > currentRank ? `Upgrade to ${p.name}` : `Switch to ${p.name}`;
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
                    <li key={f} className="text-xs text-ink/70 flex items-start gap-1.5"><span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-success shrink-0" />{f}</li>
                  ))}
                </ul>
                <div className="mt-5">
                  {label && key !== "FREE" && subscriptionBillingIsLive && canBill && <PlanButton planKey={key as "PRO" | "BUSINESS"} label={label} variant={rank > currentRank ? "primary" : "outline"} />}
                  {label && key !== "FREE" && !subscriptionBillingIsLive && <p className="text-xs text-ink/50">Available once billing opens.</p>}
                  {label && key !== "FREE" && subscriptionBillingIsLive && !canBill && <p className="text-xs text-ink/50">Ask the workspace owner to change the plan.</p>}
                  {isCurrent && <p className="text-xs text-ink/50">{key === "FREE" ? "No card on file." : business.cancelAtPeriodEnd ? "Cancels at the end of the period." : "Renews monthly."}</p>}
                  {!isCurrent && key === "FREE" && business.stripeCustomerId && live && <p className="text-xs text-ink/50">To go back to Free, cancel from Manage subscription. You keep your plan until the period ends.</p>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink/45">USD, billed monthly, cancel anytime. Plan changes are prorated by Stripe. Downgrading never deletes anything. Daythread never handles payments between you and your customers.</p>
      </section>

      {paid && snapshot && snapshot.invoices.length > 0 && (
        <section aria-label="Receipts" className="rounded-[22px] border border-border bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border text-[11px] font-bold uppercase tracking-[0.14em] text-ink/45">Receipts for your Daythread subscription</div>
          <ul className="divide-y divide-border">
            {snapshot.invoices.map((inv) => (
              <li key={inv.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                <span className="text-ink/60 tabular-nums w-28 shrink-0">{format(inv.at, "MMM d, yyyy")}</span>
                <span className="flex-1 min-w-0 truncate text-ink">{inv.number ?? "Receipt"}</span>
                <Badge tone={inv.status === "paid" ? "success" : inv.status === "open" ? "warning" : "neutral"}>{inv.status}</Badge>
                <span className="font-semibold text-ink tabular-nums w-20 text-right">{formatMoney(inv.amountCents)}</span>
                {inv.url && <a href={inv.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-ink/55 hover:text-ink">View</a>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {next && subscriptionBillingIsLive && !pastDue && canBill && <MobileUpgradeBar planKey={next as "PRO" | "BUSINESS"} label={`Upgrade to ${PLANS[next].name}`} price={formatMoney(PLANS[next].priceCents)} />}
      <p className="mt-6 text-xs text-ink/45"><Link href="/support" className="underline">Support</Link> · <Link href="/terms" className="underline">Terms</Link></p>
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
