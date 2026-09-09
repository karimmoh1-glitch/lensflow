import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { getTodayBrief, buildBriefText } from "@/server/dashboardData";
import { getWeekStrip } from "@/server/weekStrip";
import { getFirstLook } from "@/server/firstLook";
import { businessAgentEntitled } from "@/lib/billing";
import { buildAgentBrief } from "@/server/businessAgent";
import { differenceInDays } from "date-fns";
import { Users, Zap, Sparkles } from "lucide-react";
import { Card, Badge, EmptyState } from "@/components/ui";
import { cn, initials, toZonedDisplayDate } from "@/lib/utils";
import { format } from "date-fns";
import { FixMyDayButton } from "./FixMyDayButton";
import { Priorities } from "./Priorities";
import { AwayDigest } from "./AwayDigest";
import { NextActions } from "./NextActions";
import { getAwayDigest, touchLastActive } from "@/server/awayDigest";
import { getNextActions } from "@/server/nextActions";
import { AutoGmailSync } from "./inbox/AutoGmailSync";
import { prisma } from "@/lib/db";
import { effectivePlan } from "@/lib/billing";

/**
 * Home answers, in order: what happened while you were away, what to do now (one list —
 * who, why, where things stand, what it's worth, and the button that does it), what's on
 * today, and what Daythread would do next. Then PEOPLE and AUTOMATION, quieter, and a
 * strip of what Daythread handled this week (real counts; the minutes figure is labeled
 * as an estimate). The most important thing is the biggest thing.
 */
export default async function TodayPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business, user } = ctx;

  const agentOn = businessAgentEntitled(business);
  const gmail = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: business.id, provider: "EMAIL" } }, select: { refreshToken: true, status: true } });
  const gmailConnected = Boolean(gmail?.refreshToken) && gmail?.status !== "NOT_CONNECTED";
  const [brief, week, firstLook, agent, digest, next] = await Promise.all([getTodayBrief(business.id), getWeekStrip(business.id), getFirstLook(business.id), agentOn ? buildAgentBrief(business.id).catch(() => null) : Promise.resolve(null), touchLastActive(ctx.membership.id).then((prev) => getAwayDigest(business.id, prev)).catch(() => null), getNextActions(business.id, new Date(), business.timezone)]);
  const proposals = agent?.proposals.filter((p) => p.kind !== "reconnect_calendar") ?? [];
  // The first minute: show what Daythread found until the owner has replied to something.
  const showFirstLook = firstLook.total > 0 && !firstLook.hasReplied && differenceInDays(new Date(), business.createdAt) <= 30;
  // The setup card built from their /start answers, for the first weeks — until they've replied to someone.
  const showPriorities = !firstLook.hasReplied && differenceInDays(new Date(), business.createdAt) <= 30;
  const briefText = buildBriefText(brief, business.name);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user.name.split(" ")[0];
  const needsYou = next.actions.length;
  const rows = next.actions.map((a) => ({ ...a, since: a.since.toISOString(), booking: a.booking ? { ...a.booking, startAt: a.booking.startAt.toISOString() } : null }));

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 md:py-10 dt-stagger">
      {gmailConnected && <AutoGmailSync immediate />}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65 mb-2">{format(new Date(), "EEEE, MMMM d")}</p>
          <h1 className="font-sans font-extrabold text-[1.9rem] leading-none tracking-[-0.03em] text-ink">
            {greeting}, {firstName}.
          </h1>
        </div>
        <FixMyDayButton />
      </div>

      {digest && <AwayDigest digest={digest} />}

      {showPriorities && <Priorities businessId={business.id} plan={effectivePlan(business)} />}

      {showFirstLook && (
        <section aria-labelledby="first-look-label" className="mb-8 rounded-[22px] border border-signal/25 bg-white overflow-hidden dt-land">
          <div className="px-5 md:px-6 pt-5 pb-4">
            <h2 id="first-look-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">What Daythread found</h2>
            <p className="mt-1.5 font-sans font-extrabold text-[1.6rem] leading-tight tracking-[-0.03em] text-ink">
              {firstLook.total} conversation{firstLook.total === 1 ? "" : "s"}.{" "}
              <span className="text-ink/65">{firstLook.needsYou === 0 ? "None need you right now." : firstLook.needsYou === 1 ? "One needs you." : `${firstLook.needsYou} need you.`}</span>
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
                <div className="text-[11px] text-ink/65">{String(hint)}</div>
              </div>
            ))}
          </div>
          <div className="px-5 md:px-6 py-3 border-t border-border bg-paper/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/65">
            <span>Priority shows only the people. Everything else stays in <Link href="/dashboard/inbox?view=all" className="text-ink font-semibold hover:underline">All</Link>, and you can correct any of it.</span>
            {needsYou > 0 && <span className="text-accent-text font-semibold">Here {needsYou === 1 ? "is the thing" : `are the ${needsYou} things`} I&rsquo;d handle first ↓</span>}
          </div>
        </section>
      )}

      {/* NOW — what to do next, from the record */}
      <NextActions rows={rows} atRisk={next.atRisk} caughtUp={briefText} />

      {/* TODAY + ASSISTANT */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-8 mt-10">
        <section aria-labelledby="today-label">
          <h2 id="today-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65 mb-2.5">
            Today
          </h2>
          {brief.todaysBookings.length === 0 ? (
            <EmptyState title="Nothing on the calendar today" description="A quiet day. Warm leads are the best use of it." tone="success" />
          ) : (
            <BookingList bookings={brief.todaysBookings} timeFormat="h:mm a" timezone={business.timezone} linked />
          )}
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65 mt-7 mb-2.5">Coming up</h2>
          {brief.upcoming.length === 0 ? (
            <EmptyState title="No upcoming bookings yet" description="Confirmed bookings from your inbox or booking page line up here." />
          ) : (
            <BookingList bookings={brief.upcoming} timeFormat="EEE, MMM d · h:mm a" timezone={business.timezone} linked />
          )}
        </section>

        <section aria-labelledby="assistant-label">
          <h2 id="assistant-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text mb-2.5">
            Assistant
          </h2>
          <Link href="/dashboard/agent" className="block rounded-2xl border border-signal/25 bg-signal-soft/30 px-4 py-3.5 transition-all duration-150 hover:bg-signal-soft/50 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50">
            <div className="flex items-center gap-2 text-[11px] text-signal-text font-semibold"><Sparkles className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />{agentOn ? (proposals.length === 0 ? "Nothing to propose right now" : `${proposals.length} ${proposals.length === 1 ? "action" : "actions"} ready for your approval`) : "Part of Pro"}</div>
            <div className="mt-1.5 text-sm text-ink/80 leading-snug">
              {agentOn
                ? proposals.length > 0
                  ? <>{proposals.slice(0, 2).map((p) => p.title).join(" · ")}{proposals.length > 2 ? ` · ${proposals.length - 2} more` : ""}</>
                  : "Replies, confirmations and follow-ups, drafted from real threads. It checks again every time you open it."
                : "An assistant that reads your inbox and calendar and proposes the day's work — replies, confirmations, follow-ups — for you to approve."}
            </div>
          </Link>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65 mt-7 mb-2.5">People</h2>
          <Link href="/dashboard/clients" className="block rounded-2xl border border-border bg-white px-4 py-3.5 transition-all duration-150 hover:border-ink/20 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <div className="flex items-center gap-2 text-[11px] text-ink/70"><Users className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />People on the thread</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[["Customers", week.relationships.customers, "text-success-text"], ["Potential", week.relationships.leads, "text-signal-text"], ["Contacts", week.relationships.contacts, "text-ink/70"]].map(([k, v, c]) => (
                <div key={String(k)}>
                  <div className={cn("font-sans font-extrabold text-xl tracking-[-0.03em] tabular-nums", String(c))}>{String(v)}</div>
                  <div className="text-[11px] text-ink/70">{String(k)}</div>
                </div>
              ))}
            </div>
            {brief.leads.warm.length > 0 && <div className="mt-2 text-xs text-accent-text font-semibold">{brief.leads.warm.length} {brief.leads.warm.length === 1 ? "inquiry" : "inquiries"} with a service or date in mind</div>}
          </Link>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65 mt-7 mb-2.5">Automation</h2>
          <Link href="/dashboard/automations" className="block rounded-2xl border border-border bg-white px-4 py-3.5 transition-all duration-150 hover:border-ink/20 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <div className="flex items-center gap-2 text-[11px] text-ink/70"><Zap className="w-3.5 h-3.5 text-signal-text" strokeWidth={2} aria-hidden />{week.automationsOn === 0 ? "Nothing running yet" : `${week.automationsOn} running`}</div>
            <div className="mt-1.5 text-sm text-ink/80">
              {week.automatedSent > 0 ? <><span className="font-extrabold text-ink">{week.automatedSent}</span> {week.automatedSent === 1 ? "message" : "messages"} sent for you this week</> : week.automationsOn > 0 ? "Watching bookings and quiet leads. Nothing was due this week." : "Turn one on and Daythread sends confirmations, reminders and follow-ups for you."}
            </div>
          </Link>
        </section>
      </div>

      {/* THIS WEEK — real counts; minutes are an estimate and say so */}
      <section aria-labelledby="week-label" className="mt-10 rounded-2xl border border-signal/20 bg-signal-soft/30 px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="week-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">Daythread handled, last 7 days</h2>
          <p className="text-[11px] text-ink/65">≈{week.estimatedMinutes < 60 ? `${week.estimatedMinutes} min` : `${(week.estimatedMinutes / 60).toFixed(1)} h`} of your time · estimate</p>
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
              <dt className="text-[11px] text-ink/70">{String(k)}</dt>
            </div>
          ))}
        </dl>
      </section>
    </div>
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
                <span className="text-xs font-semibold text-ink/65 tabular-nums w-[4.5rem] shrink-0">{format(toZonedDisplayDate(b.startAt, timezone), timeFormat).split(" · ").pop()}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{b.client.name}</span>
                  <span className="block text-xs text-ink/65 truncate">{b.service.name}{timeFormat.includes("EEE") && ` · ${format(toZonedDisplayDate(b.startAt, timezone), "EEE, MMM d")}`}</span>
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
  CONFIRMED: "success",
  QUESTIONNAIRE_COMPLETE: "success",
  UPCOMING: "success",
  COMPLETED: "neutral",
  FOLLOWED_UP: "neutral",
  CANCELED: "danger",
};

function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.replaceAll("_", " ").toLowerCase()}</Badge>;
}
