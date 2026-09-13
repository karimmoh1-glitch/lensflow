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
import { cn, toZonedDisplayDate } from "@/lib/utils";
import { format } from "date-fns";
import { Priorities } from "./Priorities";
import { AwayDigest } from "./AwayDigest";
import { NextActions } from "./NextActions";
import { getAwayDigest, touchLastActive } from "@/server/awayDigest";
import { getNextActions } from "@/server/nextActions";
import { AutoGmailSync } from "./inbox/AutoGmailSync";
import { prisma } from "@/lib/db";

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
  // The setup checklist, for owners and admins in the first month; it hides itself once every step is done.
  const showSetup = (ctx.role === "OWNER" || ctx.role === "ADMIN") && differenceInDays(new Date(), business.createdAt) <= 30;
  const briefText = buildBriefText(brief, business.name);
  // The greeting is the owner's time of day, not the server's (production runs in UTC).
  const hour = toZonedDisplayDate(new Date(), business.timezone).getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user.name.split(" ")[0];
  const needsYou = next.actions.length;
  const rows = next.actions.map((a) => ({ ...a, since: a.since.toISOString(), booking: a.booking ? { ...a.booking, startAt: a.booking.startAt.toISOString() } : null }));

  const later = brief.upcoming.filter((b) => !brief.todaysBookings.some((t) => t.id === b.id));

  return (
    <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10">
      {gmailConnected && <AutoGmailSync immediate />}
      <header className="mb-8 lg:mb-10">
        <p className="text-13 text-ink/65">{format(toZonedDisplayDate(new Date(), business.timezone), "EEEE, MMMM d")}</p>
        <h1 className="mt-1 font-serif text-[2rem] sm:text-[2.375rem] leading-[1.1] text-ink">
          {greeting}, {firstName}.
        </h1>
        <p className="mt-2 text-sm text-ink/70">
          {needsYou === 0 ? "Nothing needs you right now." : `${needsYou} ${needsYou === 1 ? "conversation needs" : "conversations need"} you`}
          {brief.todaysBookings.length > 0 ? ` · ${brief.todaysBookings.length} ${brief.todaysBookings.length === 1 ? "session" : "sessions"} today` : ""}
          {proposals.length > 0 ? ` · ${proposals.length} ${proposals.length === 1 ? "draft" : "drafts"} to approve` : ""}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-x-10 gap-y-10">
        <div className="min-w-0 space-y-10">
          {digest && <AwayDigest digest={digest} />}

          {/* NOW — what to do next, from the record */}
          <NextActions rows={rows} atRisk={next.atRisk} caughtUp={briefText} />

          {showFirstLook && (
            <section aria-labelledby="first-look-label">
              <div className="flex items-baseline justify-between gap-4 mb-3">
                <h2 id="first-look-label" className="text-13 font-semibold text-ink">What Daythread sorted</h2>
                <Link href="/dashboard/inbox?view=all" className="inline-flex items-center min-h-[28px] text-13 text-ink/65 hover:text-ink">See all</Link>
              </div>
              <div className="rounded-lg border border-border">
                <p className="px-4 sm:px-5 py-3.5 text-sm text-ink">
                  {firstLook.total} conversation{firstLook.total === 1 ? "" : "s"} read.{" "}
                  <span className="text-ink/65">{firstLook.needsYou === 0 ? "None need you right now." : firstLook.needsYou === 1 ? "One needs you." : `${firstLook.needsYou} need you.`}</span>
                </p>
                <dl className="grid grid-cols-2 sm:grid-cols-4 border-t border-border divide-x divide-border [&>div:nth-child(3)]:border-l-0 sm:[&>div:nth-child(3)]:border-l [&>div:nth-child(n+3)]:border-t sm:[&>div:nth-child(n+3)]:border-t-0">
                  {[
                    ["People", firstLook.priority, "real conversations"],
                    ["Automated", firstLook.automated + firstLook.spam, "kept out of your way"],
                    ["Promotional", firstLook.promotional, "newsletters, offers"],
                    ["Vendors & team", firstLook.vendor + firstLook.internal, "platforms, suppliers"],
                  ].map(([k, v, hint]) => (
                    <div key={String(k)} className="px-4 sm:px-5 py-3">
                      <dt className="text-xs text-ink/65">{String(k)}</dt>
                      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{String(v)}</dd>
                      <dd className="text-xs text-ink/65">{String(hint)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="px-4 sm:px-5 py-2.5 border-t border-border bg-paper text-xs text-ink/70 rounded-b-lg">Priority shows only people. Everything else stays in All, and you can correct any of it.</p>
              </div>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-9" aria-label="Your day">
          {showSetup && <Priorities businessId={business.id} />}

          <section aria-labelledby="today-label">
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <h2 id="today-label" className="text-13 font-semibold text-ink">Today</h2>
              <Link href="/dashboard/calendar" className="inline-flex items-center min-h-[28px] text-13 text-ink/65 hover:text-ink">Calendar</Link>
            </div>
            {brief.todaysBookings.length === 0 ? (
              <p className="text-13 text-ink/65">Nothing on the calendar today.</p>
            ) : (
              <BookingList bookings={brief.todaysBookings} timeFormat="h:mm a" timezone={business.timezone} linked />
            )}
          </section>

          <section aria-labelledby="upcoming-label">
            <h2 id="upcoming-label" className="text-13 font-semibold text-ink mb-3">Coming up</h2>
            {later.length === 0 ? (
              <p className="text-13 text-ink/65">No upcoming bookings. Book someone from a conversation, or share your <Link href="/dashboard/settings?tab=business" className="text-ink underline decoration-ink/25 underline-offset-2 hover:decoration-ink">booking page</Link>.</p>
            ) : (
              <BookingList bookings={later} timeFormat="EEE, MMM d · h:mm a" timezone={business.timezone} linked />
            )}
          </section>

          <section aria-labelledby="running-label">
            <h2 id="running-label" className="text-13 font-semibold text-ink mb-1">Running for you</h2>
            <ul className="divide-y divide-border">
              {[
                {
                  href: "/dashboard/agent",
                  icon: ListChecks,
                  title: "Assistant",
                  body: agentOn
                    ? proposals.length > 0
                      ? `${proposals.length} ${proposals.length === 1 ? "draft" : "drafts"} ready to approve`
                      : "Nothing to propose right now."
                    : "Drafts replies and follow-ups for you to approve. Pro.",
                },
                {
                  href: "/dashboard/automations",
                  icon: Zap,
                  title: "Automations",
                  body: week.automationsOn === 0 ? "None on yet." : `${week.automationsOn} on · ${week.automatedSent} ${week.automatedSent === 1 ? "message" : "messages"} sent this week`,
                },
                {
                  href: "/dashboard/clients",
                  icon: Users,
                  title: "People",
                  body: `${week.relationships.customers} ${week.relationships.customers === 1 ? "customer" : "customers"} · ${week.relationships.leads} potential${week.keptOut > 0 ? ` · ${week.keptOut} automated kept out` : ""}`,
                },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="group flex items-start gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 rounded">
                    <item.icon className="mt-0.5 w-4 h-4 text-ink/55 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-13 font-medium text-ink group-hover:underline underline-offset-2">{item.title}</span>
                      <span className="block text-13 text-ink/65">{item.body}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
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
    <ol className="space-y-1.5">
      {bookings.map((b) => {
        const when = toZonedDisplayDate(b.startAt, timezone);
        const dated = timeFormat.includes("EEE");
        const row = (
          <div className={cn("flex items-stretch gap-3 rounded-lg border border-border px-3 py-2.5", b.status === "CANCELED" && "opacity-60")}>
            <span aria-hidden className={cn("w-[3px] rounded-full shrink-0", b.status === "BOOKED" ? "bg-warning" : b.status === "CANCELED" ? "bg-ink/20" : "bg-booking")} />
            <span className="w-[62px] shrink-0 text-13 tabular-nums text-ink/70 whitespace-nowrap">{dated ? format(when, "MMM d") : format(when, "h:mm a")}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-13 font-medium text-ink truncate">{b.client.name}</span>
              <span className="block text-xs text-ink/65 truncate">{b.service.name}{dated && ` · ${format(when, "EEE h:mm a")}`}</span>
              {b.status === "BOOKED" ? <span className="block text-xs text-warning-text">Not confirmed</span> : b.status === "CANCELED" ? <span className="block text-xs text-ink/65">Canceled</span> : null}
            </span>
          </div>
        );
        return (
          <li key={b.id}>
            {linked ? (
              <Link href={`/dashboard/bookings/${b.id}`} className="block rounded-lg hover:bg-paper transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ol>
  );
}
