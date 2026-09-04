import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { getTodayBrief, buildBriefText } from "@/server/dashboardData";
import { getWeekStrip } from "@/server/weekStrip";
import { getIntelligence, getFirstLook } from "@/server/intelligence";
import { intelligenceEntitled } from "@/lib/billing";
import { differenceInDays } from "date-fns";
import { Users, Zap } from "lucide-react";
import { Card, Badge, EmptyState } from "@/components/ui";
import { formatMoney, cn, initials, toZonedDisplayDate } from "@/lib/utils";
import { format, formatDistanceToNowStrict } from "date-fns";
import { FixMyDayButton } from "./FixMyDayButton";
import { OneThingCard } from "./OneThingCard";

/**
 * Home answers three questions in order, and the layout is that order:
 *   NOW    — who needs you (one card, the action color, the button to do it)
 *   TODAY  — what's on, and what isn't confirmed
 *   MONEY  — what you're owed, what came in
 * then RELATIONSHIPS and AUTOMATION, quieter, and a strip of what Daythread handled this
 * week (real counts; the minutes figure is labeled as an estimate). The most important
 * thing is the biggest thing.
 */
export default async function TodayPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business, user } = ctx;

  const executive = intelligenceEntitled(business);
  const [brief, week, intel, firstLook] = await Promise.all([getTodayBrief(business.id), getWeekStrip(business.id), executive ? getIntelligence(business.id) : Promise.resolve(null), getFirstLook(business.id)]);
  // The first minute: show what Daythread found until the owner has replied to something.
  const showFirstLook = firstLook.total > 0 && !firstLook.hasReplied && differenceInDays(new Date(), business.createdAt) <= 30;
  const briefText = buildBriefText(brief, business.name);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user.name.split(" ")[0];
  const waitingOnReply = brief.leads.all.filter((l) => !l.lead.respondedAt).slice(0, 3);
  const top = waitingOnReply[0];

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 md:py-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mb-2">{format(new Date(), "EEEE, MMMM d")}</p>
          <h1 className="font-sans font-extrabold text-[1.9rem] leading-none tracking-[-0.03em] text-ink">
            {greeting}, {firstName}.
          </h1>
        </div>
        <FixMyDayButton />
      </div>

      {showFirstLook && (
        <section aria-labelledby="first-look-label" className="mb-8 rounded-[22px] border border-signal/25 bg-white overflow-hidden dt-land">
          <div className="px-5 md:px-6 pt-5 pb-4">
            <h2 id="first-look-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">What Daythread found</h2>
            <p className="mt-1.5 font-sans font-extrabold text-[1.6rem] leading-tight tracking-[-0.03em] text-ink">
              {firstLook.total} conversation{firstLook.total === 1 ? "" : "s"}.{" "}
              <span className="text-ink/45">{firstLook.needsYou === 0 ? "None need you right now." : firstLook.needsYou === 1 ? "One needs you." : `${firstLook.needsYou} need you.`}</span>
            </p>
          </div>
          <div className="px-5 md:px-6 pb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Automated", firstLook.automated + firstLook.spam, "kept out of your way"],
              ["Promotional", firstLook.promotional, "newsletters and offers"],
              ["Vendors & internal", firstLook.vendor + firstLook.internal, "platforms, suppliers, your team"],
              ["People", firstLook.priority, "real conversations"],
            ].map(([k, v, hint], i) => (
              <div key={String(k)} className={cn("rounded-2xl px-3.5 py-3", i === 3 ? "bg-accent-soft/60" : "bg-paper")}>
                <div className={cn("font-sans font-extrabold text-2xl tracking-[-0.03em] tabular-nums", i === 3 ? "text-accent-text" : "text-ink")}>{String(v)}</div>
                <div className="text-[11px] font-semibold text-ink/70">{String(k)}</div>
                <div className="text-[11px] text-ink/45">{String(hint)}</div>
              </div>
            ))}
          </div>
          <div className="px-5 md:px-6 py-3 border-t border-border bg-paper/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/60">
            <span>Priority shows only the people. Everything else stays in <Link href="/dashboard/inbox?view=all" className="text-ink font-semibold hover:underline">All</Link>, and you can correct any of it.</span>
            {waitingOnReply.length > 0 && <span className="text-accent-text font-semibold">Here {waitingOnReply.length === 1 ? "is the thing" : `are the ${waitingOnReply.length} things`} I&rsquo;d handle first ↓</span>}
          </div>
        </section>
      )}

      {/* NOW */}
      <section aria-labelledby="now-label">
        <h2 id="now-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-text mb-2.5">
          Now
        </h2>
        {!top ? (
          <div className="rounded-2xl border border-success/25 bg-success-soft/50 px-5 py-4 flex items-center gap-3 dt-swap">
            <span className="w-2.5 h-2.5 rounded-full bg-success shrink-0" />
            <p className="text-sm text-ink/80">{briefText}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <OneThingCard
              key={top.lead.id}
              leadId={top.lead.id}
              name={top.lead.extractedName || ""}
              href={top.lead.conversationId ? `/dashboard/inbox?c=${top.lead.conversationId}` : "/dashboard/inbox"}
              waiting={top.lead.lastInboundAt ? `Waiting ${formatDistanceToNowStrict(top.lead.lastInboundAt)}.` : null}
              detail={top.score >= 70 ? "High intent" : "New inquiry"}
              more={Math.max(0, brief.leads.needsResponse.length - 1)}
            />
            {waitingOnReply.slice(1).map(({ lead, score }) => (
              <Link
                key={lead.id}
                href={lead.conversationId ? `/dashboard/inbox?c=${lead.conversationId}` : "/dashboard/inbox"}
                className="group flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-2.5 transition-all duration-150 hover:border-ink/20 hover:translate-x-0.5"
              >
                <span className="w-8 h-8 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-[11px] font-bold shrink-0">{initials(lead.extractedName || "?")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink truncate">{lead.extractedName || "Unknown"}</span>
                  <span className="block text-xs text-ink/55 truncate">
                    {lead.lastInboundAt ? `Waiting ${formatDistanceToNowStrict(lead.lastInboundAt)}` : "New inquiry"}
                    {score >= 70 && " · High intent"}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-ink/30 shrink-0 transition-all group-hover:text-ink group-hover:translate-x-0.5" strokeWidth={2} />
              </Link>
            ))}
            {brief.leads.needsResponse.length > waitingOnReply.length && (
              <Link href="/dashboard/inbox" className="inline-block text-xs font-semibold text-ink/55 hover:text-ink transition-colors pl-1">
                See all {brief.leads.needsResponse.length} in the inbox →
              </Link>
            )}
          </div>
        )}
      </section>

      {intel && (
        <section aria-labelledby="exec-label" className="mt-10">
          <div className="flex items-baseline justify-between gap-4 mb-3">
            <h2 id="exec-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45">Your business, in one glance</h2>
            <span className="text-[11px] text-ink/40">Business plan · from your records</span>
          </div>
          <div className="rounded-[22px] border border-border bg-white overflow-hidden">
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 divide-border sm:[&>li:nth-child(n+3)]:border-t lg:[&>li:nth-child(n+3)]:border-t-0 sm:[&>li:nth-child(2n)]:border-l lg:[&>li:nth-child(n+2)]:border-l">
              <Glance label="need you" value={String(intel.needsYou)} tone={intel.needsYou > 0 ? "accent" : undefined} href="/dashboard/inbox?filter=needs_reply" sub={intel.needsYou === 0 ? "Nobody waiting" : "waiting on a reply"} />
              <Glance label="in open opportunities" value={formatMoney(intel.opportunityCents)} href="/dashboard/inbox" sub={`${intel.openLeads} open ${intel.openLeads === 1 ? "inquiry" : "inquiries"}, priced from what they asked for`} />
              <Glance label="awaiting follow-up" value={String(intel.awaitingFollowUp.length)} tone={intel.awaitingFollowUp.length > 0 ? "warning" : undefined} href="/dashboard/clients" sub="customers who need a nudge" />
              <Glance label="bookings this week" value={String(intel.thisWeek.bookings)} tone="success" href="/dashboard/bookings" sub={`${formatMoney(intel.thisWeek.bookedCents)} on the calendar`} />
            </ul>
            <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border border-t border-border">
              <div className="px-5 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-text mb-2">At risk</div>
                <ul className="space-y-1.5 text-sm">
                  {intel.goingCold.slice(0, 3).map((g) => (
                    <li key={g.leadId}><Link href={g.conversationId ? `/dashboard/inbox?c=${g.conversationId}` : "/dashboard/inbox"} className="hover:underline"><span className="font-semibold text-ink">{g.name}</span></Link> <span className="text-ink/55">quiet for {Math.round(g.hours / 24)}d{g.valueCents ? ` · ${formatMoney(g.valueCents)}` : ""}</span></li>
                  ))}
                  {intel.atRisk.unconfirmedSoon > 0 && <li><Link href="/dashboard/bookings" className="hover:underline"><span className="font-semibold text-ink">{intel.atRisk.unconfirmedSoon} booking{intel.atRisk.unconfirmedSoon === 1 ? "" : "s"}</span></Link> <span className="text-ink/55">within 3 days, not confirmed</span></li>}
                  {intel.atRisk.overdueCount > 0 && <li><Link href="/dashboard/payments" className="hover:underline"><span className="font-semibold text-ink">{formatMoney(intel.atRisk.overdueCents)}</span></Link> <span className="text-ink/55">overdue across {intel.atRisk.overdueCount} payment{intel.atRisk.overdueCount === 1 ? "" : "s"}</span></li>}
                  {intel.atRisk.failedAutomations > 0 && <li><Link href="/dashboard/automations" className="hover:underline"><span className="font-semibold text-ink">{intel.atRisk.failedAutomations} automation{intel.atRisk.failedAutomations === 1 ? "" : "s"}</span></Link> <span className="text-ink/55">failed to send this week</span></li>}
                  {intel.goingCold.length === 0 && intel.atRisk.unconfirmedSoon === 0 && intel.atRisk.overdueCount === 0 && intel.atRisk.failedAutomations === 0 && <li className="text-ink/55">Nothing at risk right now.</li>}
                </ul>
              </div>
              <div className="px-5 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-signal-text mb-2">How you&rsquo;re doing</div>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-ink/55">Response time</dt><dd className="font-semibold text-ink tabular-nums">{intel.responseTimeHours === null ? "—" : intel.responseTimeHours < 1 ? `${Math.round(intel.responseTimeHours * 60)} min` : `${intel.responseTimeHours.toFixed(1)} h`} <span className="text-ink/40 font-medium text-xs">median, 30d</span></dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink/55">Inquiries → bookings</dt><dd className="font-semibold text-ink tabular-nums">{intel.conversion.rate === null ? "—" : `${Math.round(intel.conversion.rate * 100)}%`} <span className="text-ink/40 font-medium text-xs">{intel.conversion.booked}/{intel.conversion.leads}, 90d</span></dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink/55">Collected this week</dt><dd className="font-semibold text-success-text tabular-nums">{formatMoney(intel.thisWeek.collectedCents)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink/55">New inquiries this week</dt><dd className="font-semibold text-ink tabular-nums">{intel.thisWeek.newLeads}</dd></div>
                </dl>
              </div>
              <div className="px-5 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-success-text mb-2">Most valuable</div>
                <ul className="space-y-1.5 text-sm">
                  {intel.topCustomers.map((c) => (
                    <li key={c.clientId} className="flex justify-between gap-3"><Link href={`/dashboard/clients/${c.clientId}`} className="font-semibold text-ink hover:underline truncate">{c.name}</Link><span className="text-ink/55 tabular-nums shrink-0">{formatMoney(c.paidCents)} · {c.bookings}</span></li>
                  ))}
                  {intel.topCustomers.length === 0 && <li className="text-ink/55">No paying customers yet.</li>}
                  {intel.dormantCustomers > 0 && <li className="text-ink/55 pt-1">{intel.dormantCustomers} past customer{intel.dormantCustomers === 1 ? "" : "s"} gone quiet for 90+ days — <Link href="/dashboard/clients" className="text-ink font-semibold hover:underline">reach out</Link></li>}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TODAY + MONEY */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-8 mt-10">
        <section aria-labelledby="today-label">
          <h2 id="today-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mb-2.5">
            Today
          </h2>
          {brief.todaysBookings.length === 0 ? (
            <EmptyState title="Nothing on the calendar today" description="A quiet day. Warm leads are the best use of it." tone="success" />
          ) : (
            <BookingList bookings={brief.todaysBookings} timeFormat="h:mm a" timezone={business.timezone} linked />
          )}
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mt-7 mb-2.5">Coming up</h2>
          {brief.upcoming.length === 0 ? (
            <EmptyState title="No upcoming bookings yet" description="Confirmed bookings from your inbox or booking page line up here." />
          ) : (
            <BookingList bookings={brief.upcoming} timeFormat="EEE, MMM d · h:mm a" timezone={business.timezone} linked />
          )}
        </section>

        <section aria-labelledby="money-label">
          <h2 id="money-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mb-2.5">
            Money
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Owed to you" value={formatMoney(brief.money.outstandingCents)} tone={brief.money.outstandingCents > 0 ? "warning" : undefined} href="/dashboard/payments" />
            <Stat label="Collected" value={formatMoney(brief.money.collectedCents)} tone="success" href="/dashboard/payments" />
          </div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mt-7 mb-2.5">Relationships</h2>
          <Link href="/dashboard/clients" className="block rounded-2xl border border-border bg-white px-4 py-3.5 transition-all duration-150 hover:border-ink/20 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <div className="flex items-center gap-2 text-[11px] text-ink/55"><Users className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />People on the thread</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[["Customers", week.relationships.customers, "text-success-text"], ["Potential", week.relationships.leads, "text-signal-text"], ["Contacts", week.relationships.contacts, "text-ink/70"]].map(([k, v, c]) => (
                <div key={String(k)}>
                  <div className={cn("font-sans font-extrabold text-xl tracking-[-0.03em] tabular-nums", String(c))}>{String(v)}</div>
                  <div className="text-[11px] text-ink/55">{String(k)}</div>
                </div>
              ))}
            </div>
            {brief.leads.hot.length > 0 && <div className="mt-2 text-xs text-accent-text font-semibold">{brief.leads.hot.length} hot {brief.leads.hot.length === 1 ? "lead" : "leads"} worth following up</div>}
          </Link>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mt-7 mb-2.5">Automation</h2>
          <Link href="/dashboard/automations" className="block rounded-2xl border border-border bg-white px-4 py-3.5 transition-all duration-150 hover:border-ink/20 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <div className="flex items-center gap-2 text-[11px] text-ink/55"><Zap className="w-3.5 h-3.5 text-signal-text" strokeWidth={2} aria-hidden />{week.automationsOn === 0 ? "Nothing running yet" : `${week.automationsOn} running`}</div>
            <div className="mt-1.5 text-sm text-ink/80">
              {week.automatedSent > 0 ? <><span className="font-extrabold text-ink">{week.automatedSent}</span> {week.automatedSent === 1 ? "message" : "messages"} sent for you this week</> : week.automationsOn > 0 ? "Watching bookings and payments. Nothing was due this week." : "Turn one on and Daythread sends reminders, follow-ups and thank-yous for you."}
            </div>
          </Link>
          {brief.leads.hot.length > 0 && (
            <Card className="mt-3">
              <div className="divide-y divide-border">
                {brief.leads.hot.map(({ lead, score }) => (
                  <Link
                    key={lead.id}
                    href={lead.conversationId ? `/dashboard/inbox?c=${lead.conversationId}` : "/dashboard/inbox"}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-black/[0.02] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{lead.extractedName || "Unknown"}</div>
                      <div className="text-xs text-ink/60">
                        {lead.requestedDateText && `${lead.requestedDateText} · `}
                        {formatMoney(lead.estimatedValueCents)}
                      </div>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-accent-text shrink-0 tabular-nums">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                      {score}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </section>
      </div>

      {/* THIS WEEK — real counts; minutes are an estimate and say so */}
      <section aria-labelledby="week-label" className="mt-10 rounded-2xl border border-signal/20 bg-signal-soft/30 px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="week-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">Daythread handled, last 7 days</h2>
          <p className="text-[11px] text-ink/45">≈{week.estimatedMinutes < 60 ? `${week.estimatedMinutes} min` : `${(week.estimatedMinutes / 60).toFixed(1)} h`} of your time · estimate</p>
        </div>
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ["Messages sent for you", week.automatedSent],
            ["Kept out of your way", week.keptOut],
            ["Inquiries structured", week.structuredLeads],
            ["Turned into bookings", week.bookedLeads],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <dd className="font-sans font-extrabold text-2xl tracking-[-0.03em] tabular-nums text-ink">{String(v)}</dd>
              <dt className="text-[11px] text-ink/55">{String(k)}</dt>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function Glance({ label, value, tone, href, sub }: { label: string; value: string; tone?: "warning" | "accent" | "success"; href: string; sub?: string }) {
  return (
    <li>
      <Link href={href} className="block px-5 py-4 hover:bg-black/[0.02] transition-colors focus-visible:outline-none focus-visible:bg-black/[0.03]">
        <div className={cn("font-sans font-extrabold text-[1.75rem] leading-none tracking-[-0.03em] tabular-nums", tone === "warning" ? "text-warning-text" : tone === "accent" ? "text-accent-text" : tone === "success" ? "text-success-text" : "text-ink")}>{value}</div>
        <div className="mt-1 text-sm font-semibold text-ink">{label}</div>
        {sub && <div className="text-[11px] text-ink/50 mt-0.5">{sub}</div>}
      </Link>
    </li>
  );
}

function Stat({ label, value, tone, href }: { label: string; value: string; tone?: "warning" | "accent" | "success"; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-border bg-white px-4 py-3.5 transition-all duration-150 hover:border-ink/20 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <div className="text-[11px] text-ink/55">{label}</div>
      <div
        className={cn(
          "font-sans font-extrabold text-2xl tracking-[-0.03em] tabular-nums mt-0.5",
          tone === "warning" ? "text-warning-text" : tone === "accent" ? "text-accent-text" : tone === "success" ? "text-success-text" : "text-ink"
        )}
      >
        {value}
      </div>
    </Link>
  );
}

function BookingList({
  bookings,
  timeFormat,
  timezone,
  linked,
}: {
  bookings: { id: string; startAt: Date; status: string; service: { name: string }; client: { name: string } }[];
  timeFormat: string;
  timezone: string;
  linked?: boolean;
}) {
  return (
    <Card>
      <div className="divide-y divide-border">
        {bookings.map((b) => {
          const row = (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex items-center gap-3">
                <span className="text-xs font-semibold text-ink/50 tabular-nums w-[4.5rem] shrink-0">{format(toZonedDisplayDate(b.startAt, timezone), timeFormat).split(" · ").pop()}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{b.client.name}</span>
                  <span className="block text-xs text-ink/60 truncate">{b.service.name}{timeFormat.includes("EEE") && ` · ${format(toZonedDisplayDate(b.startAt, timezone), "EEE, MMM d")}`}</span>
                </span>
              </div>
              <StatusBadge status={b.status} />
            </div>
          );
          return linked ? (
            <Link key={b.id} href={`/dashboard/bookings/${b.id}`} className="block hover:bg-black/[0.02] transition-colors">
              {row}
            </Link>
          ) : (
            <div key={b.id}>{row}</div>
          );
        })}
      </div>
    </Card>
  );
}

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "info" | "danger"> = {
  INQUIRY: "neutral",
  BOOKED: "info",
  DEPOSIT_PAID: "warning",
  CONFIRMED: "success",
  QUESTIONNAIRE_COMPLETE: "success",
  UPCOMING: "success",
  COMPLETED: "neutral",
  BALANCE_PAID: "success",
  FOLLOWED_UP: "neutral",
  CANCELED: "danger",
};

function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.replaceAll("_", " ").toLowerCase()}</Badge>;
}
