import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { getTodayBrief, buildBriefText } from "@/server/dashboardData";
import { getWeekStrip } from "@/server/weekStrip";
import { getFirstLook } from "@/server/firstLook";
import { businessAgentEntitled } from "@/lib/billing";
import { buildAgentBrief } from "@/server/businessAgent";
import { differenceInDays } from "date-fns";
import { Users, Zap, ListChecks } from "lucide-react";
import { Card, Badge, EmptyState } from "@/components/ui";
import { cn, initials, toZonedDisplayDate } from "@/lib/utils";
import { format } from "date-fns";
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
      <header className="mb-8">
        <p className="text-13 text-ink/55">{format(new Date(), "EEEE, MMMM d")}</p>
        <h1 className="mt-1 font-sans font-bold text-[1.75rem] leading-tight tracking-[-0.025em] text-ink">
          {greeting}, {firstName}.
        </h1>
        <p className="mt-1.5 text-sm text-ink/60">
          {needsYou === 0 ? "Nothing needs you right now." : `${needsYou} ${needsYou === 1 ? "thing needs" : "things need"} you`}
          {brief.todaysBookings.length > 0 ? ` · ${brief.todaysBookings.length} ${brief.todaysBookings.length === 1 ? "booking" : "bookings"} today` : ""}
          {proposals.length > 0 ? ` · ${proposals.length} ${proposals.length === 1 ? "draft" : "drafts"} ready to approve` : ""}
        </p>
      </header>

      {digest && <AwayDigest digest={digest} />}

      {showPriorities && <Priorities businessId={business.id} plan={effectivePlan(business)} />}

      {showFirstLook && (
        <section aria-labelledby="first-look-label" className="mb-8 rounded-xl border border-border bg-white overflow-hidden dt-land">
          <div className="px-5 md:px-6 pt-5 pb-4">
            <h2 id="first-look-label" className="text-13 font-semibold text-ink/75">What Daythread found</h2>
            <p className="mt-1.5 font-sans font-bold text-[1.35rem] leading-tight tracking-[-0.02em] text-ink">
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
              <div key={String(k)} className={cn("rounded-lg px-3.5 py-3 border", i === 3 ? "border-ink/15 bg-white" : "border-transparent bg-paper")}>
                <div className="font-sans font-bold text-2xl tracking-[-0.02em] tabular-nums text-ink">{String(v)}</div>
                <div className="text-2xs font-semibold text-ink/70">{String(k)}</div>
                <div className="text-2xs text-ink/65">{String(hint)}</div>
              </div>
            ))}
          </div>
          <div className="px-5 md:px-6 py-3 border-t border-border bg-paper/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/65">
            <span>Priority shows only the people. Everything else stays in <Link href="/dashboard/inbox?view=all" className="text-ink font-semibold hover:underline">All</Link>, and you can correct any of it.</span>
            {needsYou > 0 && <span className="text-ink font-medium">Start with what needs you, below.</span>}
          </div>
        </section>
      )}

      {/* NOW — what to do next, from the record */}
      <NextActions rows={rows} atRisk={next.atRisk} caughtUp={briefText} />

      {/* TODAY + ASSISTANT */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-8 mt-10">
        <section aria-labelledby="today-label">
          <h2 id="today-label" className="text-13 font-semibold text-ink/70 mb-2.5">
            Today
          </h2>
          {brief.todaysBookings.length === 0 ? (
            <p className="rounded-xl border border-border bg-white px-4 py-3.5 text-13 text-ink/60">Nothing on the calendar today.</p>
          ) : (
            <BookingList bookings={brief.todaysBookings} timeFormat="h:mm a" timezone={business.timezone} linked />
          )}
          <h2 className="text-13 font-semibold text-ink/65 mt-7 mb-2.5">Coming up</h2>
          {brief.upcoming.filter((b) => !brief.todaysBookings.some((t) => t.id === b.id)).length === 0 ? (
            <p className="rounded-xl border border-border bg-white px-4 py-3.5 text-13 text-ink/60">No upcoming bookings. Book someone from a conversation, or share your <Link href="/dashboard/settings?tab=business" className="font-medium text-ink underline decoration-ink/20 underline-offset-2">booking page</Link>.</p>
          ) : (
            <BookingList bookings={brief.upcoming.filter((b) => !brief.todaysBookings.some((t) => t.id === b.id))} timeFormat="EEE, MMM d · h:mm a" timezone={business.timezone} linked />
          )}
        </section>

        <section aria-labelledby="running-label">
          <h2 id="running-label" className="text-13 font-semibold text-ink/70 mb-2.5">Running for you</h2>
          <div className="rounded-xl border border-border bg-white shadow-surface divide-y divide-border">
            <Link href="/dashboard/agent" className="flex items-start gap-3 px-4 py-3.5 hover:bg-black/[0.02] transition-colors focus-visible:outline-none focus-visible:bg-black/[0.03]">
              <ListChecks className="mt-0.5 w-4 h-4 text-ink/50 shrink-0" strokeWidth={2} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-13 font-semibold text-ink">Assistant</span>
                <span className="block text-13 text-ink/60 leading-snug">
                  {agentOn
                    ? proposals.length > 0
                      ? `${proposals.length} ${proposals.length === 1 ? "draft" : "drafts"} ready: ${proposals.slice(0, 2).map((p) => p.title).join(", ")}${proposals.length > 2 ? "…" : ""}`
                      : "Nothing to propose. It checks again every time you open it."
                    : "Drafts the day's replies and follow-ups for you to approve. Part of Pro."}
                </span>
              </span>
            </Link>
            <Link href="/dashboard/automations" className="flex items-start gap-3 px-4 py-3.5 hover:bg-black/[0.02] transition-colors focus-visible:outline-none focus-visible:bg-black/[0.03]">
              <Zap className="mt-0.5 w-4 h-4 text-ink/50 shrink-0" strokeWidth={2} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-13 font-semibold text-ink">Automations</span>
                <span className="block text-13 text-ink/60 leading-snug">
                  {week.automationsOn === 0
                    ? "None on yet. Turn one on and confirmations and follow-ups send themselves."
                    : `${week.automationsOn} on · ${week.automatedSent} ${week.automatedSent === 1 ? "message" : "messages"} sent this week`}
                </span>
              </span>
            </Link>
            <Link href="/dashboard/clients" className="flex items-start gap-3 px-4 py-3.5 hover:bg-black/[0.02] transition-colors focus-visible:outline-none focus-visible:bg-black/[0.03]">
              <Users className="mt-0.5 w-4 h-4 text-ink/50 shrink-0" strokeWidth={2} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-13 font-semibold text-ink">People</span>
                <span className="block text-13 text-ink/60 leading-snug">
                  {week.relationships.customers} {week.relationships.customers === 1 ? "customer" : "customers"} · {week.relationships.leads} potential
                  {week.keptOut > 0 ? ` · ${week.keptOut} automated ${week.keptOut === 1 ? "message" : "messages"} kept out of your way this week` : ""}
                </span>
              </span>
            </Link>
          </div>
        </section>
      </div>
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
                <span className="text-13 font-medium text-ink/60 tabular-nums w-[4.5rem] shrink-0">{format(toZonedDisplayDate(b.startAt, timezone), timeFormat).split(" · ").pop()}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{b.client.name}</span>
                  <span className="block text-xs text-ink/65 truncate">{b.service.name}{timeFormat.includes("EEE") && ` · ${format(toZonedDisplayDate(b.startAt, timezone), "EEE, MMM d")}`}</span>
                </span>
              </div>
              {b.status === "BOOKED" ? <span className="text-xs font-medium text-warning-text shrink-0">Not confirmed</span> : b.status === "CANCELED" ? <span className="text-xs text-ink/50 shrink-0">Canceled</span> : null}
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
