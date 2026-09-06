import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { intelligenceEntitled, effectivePlan, PLANS } from "@/lib/billing";
import { getIntelligence } from "@/server/intelligence";
import { prisma } from "@/lib/db";
import { PageHeader, StatTile, SectionLabel } from "@/components/ui";
import { formatMoney, cn, initials } from "@/lib/utils";
import { subDays, format, startOfWeek, addWeeks } from "date-fns";
import { Lock, TrendingUp, Clock, Users, AlertTriangle } from "lucide-react";

/**
 * Analytics: the executive read of the business, from its own records. Business plan.
 * Every number here is computed from the database at request time — there is no sample
 * data, no projection, and nothing counted that didn't happen. Free and Pro see what the
 * page contains and what it would cost, not a mock of it.
 */
export default async function AnalyticsPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;
  const plan = effectivePlan(business);

  if (!intelligenceEntitled(business)) {
    const canBill = ctx.role === "OWNER" || ctx.role === "ADMIN";
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <PageHeader title="Analytics" description="How the business is actually doing — from your own records, updated as they change." />
        <section className="rounded-[26px] border border-border bg-white overflow-hidden">
          <div className="px-6 py-6 md:px-8 md:py-8 bg-[radial-gradient(120%_140%_at_100%_0%,rgba(30,142,90,0.10),transparent_55%)]">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-signal-text"><Lock className="w-3 h-3" strokeWidth={2.5} aria-hidden /> Business plan</span>
            <h2 className="mt-2 font-sans font-extrabold text-[1.6rem] md:text-[1.9rem] leading-[1.05] tracking-[-0.03em] text-ink">See the whole business in one glance.</h2>
            <p className="mt-2 max-w-xl text-sm text-ink/65 leading-relaxed">What&rsquo;s at risk, what&rsquo;s converting, how fast you respond, how much revenue is sitting in open conversations, who your most valuable customers are and who is going quiet — computed from your real data, never estimated.</p>
            <ul className="mt-5 grid sm:grid-cols-2 gap-2.5">
              {[[TrendingUp, "Inquiries → bookings conversion, last 90 days"], [Clock, "Median first-response time, last 30 days"], [Users, "Most valuable customers and dormant ones"], [AlertTriangle, "Unconfirmed bookings, overdue balances, failed automations"]].map(([Icon, text], i) => {
                const I = Icon as typeof TrendingUp;
                return <li key={i} className="flex items-start gap-2.5 rounded-xl border border-border bg-white/80 px-3.5 py-3 text-sm text-ink/80"><span className="w-7 h-7 rounded-lg bg-success/10 text-success-text flex items-center justify-center shrink-0"><I className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /></span><span className="leading-snug">{text as string}</span></li>;
              })}
            </ul>
          </div>
          <div className="px-6 py-4 md:px-8 border-t border-border flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="flex-1 text-sm text-ink/65">You&rsquo;re on <span className="font-semibold text-ink">{PLANS[plan].name}</span>. Analytics and the Business Agent are part of Business, ${PLANS.BUSINESS.priceCents / 100}/month.</p>
            {canBill ? <Link href="/dashboard/billing" className="inline-flex items-center justify-center h-10 px-5 rounded-full bg-ink text-white text-sm font-bold hover:bg-black transition-colors">Upgrade to Business →</Link> : <span className="text-xs text-ink/50">Ask the workspace owner to upgrade.</span>}
          </div>
        </section>
      </div>
    );
  }

  const now = new Date();
  const [intel, weekly, byChannel, automationRuns] = await Promise.all([
    getIntelligence(business.id, now),
    // Eight weeks of inquiries and bookings, by week, from the records.
    Promise.all(
      Array.from({ length: 8 }).map(async (_, i) => {
        const start = startOfWeek(addWeeks(now, i - 7), { weekStartsOn: 1 });
        const end = addWeeks(start, 1);
        const [leads, booked, collected] = await Promise.all([
          prisma.lead.count({ where: { businessId: business.id, createdAt: { gte: start, lt: end } } }),
          prisma.booking.count({ where: { businessId: business.id, createdAt: { gte: start, lt: end }, status: { not: "CANCELED" } } }),
          prisma.payment.aggregate({ where: { businessId: business.id, status: "PAID", confirmedAt: { gte: start, lt: end } }, _sum: { amountCents: true } }),
        ]);
        return { start, leads, booked, collectedCents: collected._sum.amountCents ?? 0 };
      })
    ),
    prisma.conversation.groupBy({ by: ["channel"], where: { businessId: business.id, category: "PRIORITY", lastMessageAt: { gte: subDays(now, 30) } }, _count: { _all: true } }),
    prisma.automationExecution.groupBy({ by: ["result"], where: { businessId: business.id, ranAt: { gte: subDays(now, 30) } }, _count: { _all: true } }),
  ]);
  const maxCollected = Math.max(1, ...weekly.map((w) => w.collectedCents));
  const maxLeads = Math.max(1, ...weekly.map((w) => w.leads));
  const channelTotal = byChannel.reduce((s, c) => s + c._count._all, 0);
  const runs = Object.fromEntries(automationRuns.map((r) => [r.result, r._count._all])) as Record<string, number>;
  const CHANNEL: Record<string, string> = { EMAIL: "Email", INSTAGRAM: "Instagram", WHATSAPP: "WhatsApp", SMS: "SMS", WEBSITE: "Booking page", PHONE: "Phone" };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10 dt-stagger">
      <PageHeader title="Analytics" description="From your records, right now. Nothing here is estimated." action={<span className="text-[11px] font-bold uppercase tracking-[0.12em] text-signal-text bg-signal-soft rounded-full px-2.5 py-1">Business</span>} />

      <SectionLabel hint="last 90 days · last 30 days">How you&rsquo;re doing</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-[22px] border border-border overflow-hidden mb-8">
        <StatTile label="Inquiries → bookings" value={intel.conversion.rate === null ? "—" : `${Math.round(intel.conversion.rate * 100)}%`} sub={`${intel.conversion.booked} of ${intel.conversion.leads} inquiries, 90 days`} tone={intel.conversion.rate !== null && intel.conversion.rate >= 0.3 ? "success" : "neutral"} />
        <StatTile label="First response" value={intel.responseTimeHours === null ? "—" : intel.responseTimeHours < 1 ? `${Math.round(intel.responseTimeHours * 60)}m` : `${intel.responseTimeHours.toFixed(1)}h`} sub="median, 30 days" tone={intel.responseTimeHours !== null && intel.responseTimeHours > 24 ? "warning" : "neutral"} />
        <StatTile label="In open conversations" value={formatMoney(intel.opportunityCents)} sub={`${intel.openLeads} open inquir${intel.openLeads === 1 ? "y" : "ies"}, priced from what they asked for`} tone="signal" />
        <StatTile label="Collected this week" value={formatMoney(intel.thisWeek.collectedCents)} sub={`${intel.thisWeek.bookings} booking${intel.thisWeek.bookings === 1 ? "" : "s"} · ${formatMoney(intel.thisWeek.bookedCents)} on the calendar`} tone="success" />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 mb-8">
        <section className="rounded-[22px] border border-border bg-white px-5 py-4" aria-label="Eight weeks">
          <SectionLabel hint="inquiries vs collected, by week">Eight weeks</SectionLabel>
          <div className="grid grid-cols-8 gap-2 items-end h-40">
            {weekly.map((w) => (
              <div key={w.start.toISOString()} className="flex flex-col items-center justify-end gap-1 h-full" title={`${format(w.start, "MMM d")}: ${w.leads} inquiries, ${w.booked} booked, ${formatMoney(w.collectedCents)} collected`}>
                <div className="w-full flex items-end justify-center gap-0.5 flex-1">
                  <div className="w-2.5 rounded-t bg-signal/70" style={{ height: `${Math.max(3, (w.leads / maxLeads) * 100)}%` }} aria-hidden />
                  <div className="w-2.5 rounded-t bg-success" style={{ height: `${Math.max(3, (w.collectedCents / maxCollected) * 100)}%` }} aria-hidden />
                </div>
                <span className="text-[10px] text-ink/45 tabular-nums">{format(w.start, "M/d")}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-[11px] text-ink/55"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-signal/70" />Inquiries</span><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-success" />Collected</span></div>
        </section>

        <section className="rounded-[22px] border border-border bg-white px-5 py-4" aria-label="Where conversations come from">
          <SectionLabel hint="real conversations, 30 days">Where conversations come from</SectionLabel>
          {channelTotal === 0 ? (
            <p className="text-sm text-ink/55">No conversations in the last 30 days.</p>
          ) : (
            <ul className="space-y-2.5">
              {byChannel.sort((a, b) => b._count._all - a._count._all).map((c) => (
                <li key={c.channel}>
                  <div className="flex items-center justify-between text-sm"><span className="text-ink">{CHANNEL[c.channel] ?? c.channel}</span><span className="text-ink/55 tabular-nums">{c._count._all} · {Math.round((c._count._all / channelTotal) * 100)}%</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-black/[0.05] overflow-hidden"><div className="h-full rounded-full bg-ink" style={{ width: `${(c._count._all / channelTotal) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <section className="rounded-[22px] border border-border bg-white px-5 py-4" aria-label="At risk">
          <SectionLabel tone="accent">At risk</SectionLabel>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-3"><Link href="/dashboard/bookings" className="text-ink hover:underline">Unconfirmed within 3 days</Link><span className={cn("font-semibold tabular-nums", intel.atRisk.unconfirmedSoon ? "text-warning-text" : "text-ink/50")}>{intel.atRisk.unconfirmedSoon}</span></li>
            <li className="flex justify-between gap-3"><Link href="/dashboard/payments" className="text-ink hover:underline">Overdue balances</Link><span className={cn("font-semibold tabular-nums", intel.atRisk.overdueCount ? "text-danger-text" : "text-ink/50")}>{intel.atRisk.overdueCount ? `${formatMoney(intel.atRisk.overdueCents)} · ${intel.atRisk.overdueCount}` : "0"}</span></li>
            <li className="flex justify-between gap-3"><Link href="/dashboard/automations" className="text-ink hover:underline">Failed automations, 7 days</Link><span className={cn("font-semibold tabular-nums", intel.atRisk.failedAutomations ? "text-danger-text" : "text-ink/50")}>{intel.atRisk.failedAutomations}</span></li>
            <li className="flex justify-between gap-3"><Link href="/dashboard/inbox" className="text-ink hover:underline">Waiting on a reply</Link><span className={cn("font-semibold tabular-nums", intel.needsYou ? "text-accent-text" : "text-ink/50")}>{intel.needsYou}</span></li>
          </ul>
        </section>
        <section className="rounded-[22px] border border-border bg-white px-5 py-4" aria-label="Most valuable">
          <SectionLabel tone="success">Most valuable</SectionLabel>
          {intel.topCustomers.length === 0 ? <p className="text-sm text-ink/55">No paying customers yet.</p> : (
            <ul className="space-y-2.5">
              {intel.topCustomers.map((c) => (
                <li key={c.clientId}><Link href={`/dashboard/clients/${c.clientId}`} className="flex items-center gap-2.5 text-sm hover:underline"><span className="w-7 h-7 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-[10px] font-semibold shrink-0">{initials(c.name)}</span><span className="flex-1 min-w-0 truncate text-ink">{c.name}</span><span className="text-ink/60 tabular-nums">{formatMoney(c.paidCents)} · {c.bookings}</span></Link></li>
              ))}
            </ul>
          )}
          {intel.dormantCustomers > 0 && <p className="mt-3 text-[11px] text-ink/50">{intel.dormantCustomers} customer{intel.dormantCustomers === 1 ? "" : "s"} going quiet — <Link href="/dashboard/agent" className="text-signal-text font-semibold hover:underline">let the agent follow up</Link>.</p>}
        </section>
        <section className="rounded-[22px] border border-border bg-white px-5 py-4" aria-label="Automations">
          <SectionLabel tone="signal">Automations · 30 days</SectionLabel>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span className="text-ink">Sent</span><span className="font-semibold text-success-text tabular-nums">{runs.sent ?? 0}</span></li>
            <li className="flex justify-between"><span className="text-ink">Skipped</span><span className="font-semibold text-ink/60 tabular-nums">{runs.skipped ?? 0}</span></li>
            <li className="flex justify-between"><span className="text-ink">Not delivered</span><span className="font-semibold text-warning-text tabular-nums">{runs.not_configured ?? 0}</span></li>
            <li className="flex justify-between"><span className="text-ink">Failed</span><span className="font-semibold text-danger-text tabular-nums">{runs.failed ?? 0}</span></li>
          </ul>
          <p className="mt-3 text-[11px] text-ink/50">&ldquo;Not delivered&rdquo; means the channel wasn&rsquo;t connected when it ran — nothing was pretended sent.</p>
        </section>
      </div>

      {intel.team.length > 1 && (
        <section className="rounded-[22px] border border-border bg-white px-5 py-4" aria-label="Team">
          <SectionLabel hint={intel.unassignedNeedsReply ? `${intel.unassignedNeedsReply} waiting with no owner` : undefined}>Team</SectionLabel>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {intel.team.map((m) => (
              <li key={m.membershipId} className="rounded-xl border border-border px-3 py-2.5 flex items-center gap-2.5"><span className="w-7 h-7 rounded-full bg-signal-soft text-signal-text flex items-center justify-center text-[10px] font-semibold">{initials(m.name)}</span><div className="min-w-0"><div className="text-sm font-medium text-ink truncate">{m.name}</div><div className="text-[11px] text-ink/50">{m.open} open{m.needsReply ? ` · ${m.needsReply} need a reply` : ""}</div></div></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
