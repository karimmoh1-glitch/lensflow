import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPersonalization } from "@/server/personalization";
import { PageHeader, Badge, EmptyState, LinkButton, SegmentedLinks } from "@/components/ui";
import { formatMoney, toZonedDisplayDate, cn } from "@/lib/utils";
import { format, isSameDay, isThisWeek, addDays } from "date-fns";
import { ChevronRight, CalendarDays, MapPin } from "lucide-react";

const STATUS: Record<string, { tone: "neutral" | "success" | "warning" | "info" | "danger" | "booking"; label: string }> = {
  INQUIRY: { tone: "neutral", label: "Inquiry" },
  BOOKED: { tone: "warning", label: "Not confirmed" },
  CONFIRMED: { tone: "booking", label: "Confirmed" },
  QUESTIONNAIRE_COMPLETE: { tone: "booking", label: "Ready" },
  UPCOMING: { tone: "booking", label: "Upcoming" },
  COMPLETED: { tone: "neutral", label: "Completed" },
  FOLLOWED_UP: { tone: "neutral", label: "Followed up" },
  CANCELED: { tone: "neutral", label: "Canceled" },
};

type Scope = "upcoming" | "past" | "canceled";

/**
 * Bookings, the way a business reads them: what's next (grouped by Today / This week /
 * Later), then what's done, then what fell through. Every row says who, what, when, where,
 * what's paid and what still isn't — on one line at desktop, two on a phone.
 */
export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;
  const sp = await searchParams;
  const scope: Scope = sp.view === "past" || sp.view === "canceled" ? sp.view : "upcoming";
  const now = new Date();
  const tz = business.timezone;

  // Each tab reads only its own rows, most relevant first, capped so a long history stays fast.
  const include = { client: true, service: true } as const;
  const [upcoming, past, canceled, unconfirmed, pastCount, canceledCount] = await Promise.all([
    prisma.booking.findMany({ where: { businessId: business.id, status: { not: "CANCELED" }, endAt: { gte: now } }, include, orderBy: { startAt: "asc" }, take: 300 }),
    scope === "past" ? prisma.booking.findMany({ where: { businessId: business.id, status: { not: "CANCELED" }, endAt: { lt: now } }, include, orderBy: { startAt: "desc" }, take: 300 }) : Promise.resolve([]),
    scope === "canceled" ? prisma.booking.findMany({ where: { businessId: business.id, status: "CANCELED" }, include, orderBy: { startAt: "desc" }, take: 300 }) : Promise.resolve([]),
    prisma.booking.count({ where: { businessId: business.id, status: "BOOKED", endAt: { gte: now } } }),
    prisma.booking.count({ where: { businessId: business.id, status: { not: "CANCELED" }, endAt: { lt: now } } }),
    prisma.booking.count({ where: { businessId: business.id, status: "CANCELED" } }),
  ]);
  const total = upcoming.length + pastCount + canceledCount;
  const rows = scope === "upcoming" ? upcoming : scope === "past" ? past : canceled;

  const groupOf = (d: Date) => {
    const z = toZonedDisplayDate(d, tz);
    const today = toZonedDisplayDate(now, tz);
    if (isSameDay(z, today)) return "Today";
    if (isSameDay(z, addDays(today, 1))) return "Tomorrow";
    if (isThisWeek(z, { weekStartsOn: 1 })) return "This week";
    return format(z, "MMMM yyyy");
  };
  const groups: Array<{ label: string; items: typeof rows }> = [];
  for (const b of rows) {
    const label = scope === "upcoming" ? groupOf(b.startAt) : format(toZonedDisplayDate(b.startAt, tz), "MMMM yyyy");
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(b);
    else groups.push({ label, items: [b] });
  }

  const personalization = await getPersonalization(business.id);
  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader
        title="Bookings"
        description={upcoming.length === 0 ? "Nothing on the books yet." : `${upcoming.length} upcoming${unconfirmed ? ` · ${unconfirmed} not confirmed` : ""}`}
        action={<LinkButton href="/dashboard/calendar" variant="outline" size="sm"><CalendarDays className="w-4 h-4 text-ink/60" strokeWidth={1.75} aria-hidden />Calendar</LinkButton>}
      />

      <SegmentedLinks
        label="Which bookings"
        className="mb-6"
        items={([["upcoming", "Upcoming", upcoming.length], ["past", "Past", pastCount], ["canceled", "Canceled", canceledCount]] as const).map(([key, label, n]) => ({ href: key === "upcoming" ? "/dashboard/bookings" : `/dashboard/bookings?view=${key}`, label, count: n, active: scope === key }))}
      />

      {total === 0 ? (
        <EmptyState
          title={personalization?.usesBookings ? "Set up your first booking workflow" : "No bookings yet"}
          description={personalization?.usesBookings ? "You said customers book with you. Add your services and hours once; then book anyone from their conversation, or share your booking page and let them pick a time. The confirmation is sent for you." : "Bookings made from a conversation or your public booking page show up here — on the calendar, with the confirmation sent for you."}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <LinkButton href="/dashboard/settings?tab=business">Set your services and hours</LinkButton>
              <LinkButton href="/dashboard/inbox" variant="outline">Book from a conversation</LinkButton>
            </div>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState title={scope === "upcoming" ? "Nothing coming up" : scope === "past" ? "Nothing completed yet" : "No canceled bookings"} description={scope === "upcoming" ? "Book someone from their thread, or share your booking page and let them pick a time." : undefined} />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className={cn("mb-2 text-13 font-semibold", g.label === "Today" ? "text-ink" : "text-ink/65")}>{g.label}</h2>
              <ol className="rounded-lg border border-border bg-white divide-y divide-border overflow-hidden">
                {g.items.map((b) => {
                  const start = toZonedDisplayDate(b.startAt, tz);
                  const st = STATUS[b.status] ?? { tone: "neutral" as const, label: b.status.toLowerCase() };
                  return (
                    <li key={b.id}>
                      <Link href={`/dashboard/bookings/${b.id}`} className="flex items-center gap-4 px-4 md:px-5 py-3 hover:bg-paper transition-colors">
                        <div className="w-10 shrink-0">
                          <div className="text-xs text-ink/65 leading-none">{format(start, "EEE")}</div>
                          <div className="mt-1 text-lg font-semibold text-ink leading-none tabular-nums">{format(start, "d")}</div>
                        </div>
                        <span aria-hidden className={cn("self-stretch w-[3px] rounded-full shrink-0", b.status === "BOOKED" ? "bg-warning" : b.status === "CANCELED" ? "bg-ink/15" : "bg-booking")} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-ink truncate">{b.client.name}</span>
                            <Badge tone={st.tone}>{st.label}</Badge>
                          </div>
                          <div className="text-xs text-ink/65 truncate mt-0.5">
                            {format(start, "h:mm a")} · {b.service.name}{b.location ? <span className="inline-flex items-center gap-0.5"> · <MapPin className="w-3 h-3" strokeWidth={1.75} aria-hidden />{b.location}</span> : null}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-13 font-medium text-ink tabular-nums">{formatMoney(b.totalCents)}</div>
                          <div className="text-xs text-ink/65">{b.service.durationMins} min</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-ink/30 shrink-0" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
