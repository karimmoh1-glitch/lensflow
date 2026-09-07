import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPersonalization } from "@/server/personalization";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { formatMoney, toZonedDisplayDate, cn, initials } from "@/lib/utils";
import { format, isSameDay, isThisWeek, addDays } from "date-fns";
import { ChevronRight, CalendarDays, MapPin } from "lucide-react";

const STATUS: Record<string, { tone: "neutral" | "success" | "warning" | "info" | "danger"; label: string }> = {
  INQUIRY: { tone: "neutral", label: "Inquiry" },
  BOOKED: { tone: "warning", label: "Not confirmed" },
  CONFIRMED: { tone: "success", label: "Confirmed" },
  QUESTIONNAIRE_COMPLETE: { tone: "success", label: "Ready" },
  UPCOMING: { tone: "success", label: "Upcoming" },
  COMPLETED: { tone: "neutral", label: "Completed" },
  FOLLOWED_UP: { tone: "neutral", label: "Followed up" },
  CANCELED: { tone: "danger", label: "Canceled" },
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

  const all = await prisma.booking.findMany({
    where: { businessId: business.id },
    include: { client: true, service: true },
    orderBy: { startAt: "asc" },
  });
  const upcoming = all.filter((b) => b.status !== "CANCELED" && b.endAt >= now);
  const past = all.filter((b) => b.status !== "CANCELED" && b.endAt < now).sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  const canceled = all.filter((b) => b.status === "CANCELED").sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  const rows = scope === "upcoming" ? upcoming : scope === "past" ? past : canceled;
  const unconfirmed = upcoming.filter((b) => b.status === "BOOKED").length;

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
        action={<Link href="/dashboard/calendar" className="inline-flex items-center h-9 px-3.5 rounded-full border border-border bg-white text-sm font-semibold text-ink hover:bg-black/[0.03]"><CalendarDays className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden />Calendar</Link>}
      />

      <div className="flex items-center gap-1 mb-5 rounded-full bg-black/[0.04] p-1 w-fit" role="tablist" aria-label="Which bookings">
        {([["upcoming", "Upcoming", upcoming.length], ["past", "Past", past.length], ["canceled", "Canceled", canceled.length]] as const).map(([key, label, n]) => (
          <Link key={key} href={key === "upcoming" ? "/dashboard/bookings" : `/dashboard/bookings?view=${key}`} role="tab" aria-selected={scope === key} className={cn("inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-semibold transition-colors", scope === key ? "bg-white text-ink shadow-xs" : "text-ink/70 hover:text-ink")}>
            {label} <span className={cn("text-[11px] tabular-nums", scope === key ? "text-ink/65" : "text-ink/65")}>{n}</span>
          </Link>
        ))}
      </div>

      {all.length === 0 ? (
        <EmptyState
          title={personalization?.usesBookings ? "Set up your first booking workflow" : "No bookings yet"}
          description={personalization?.usesBookings ? "You said customers book with you. Add your services and hours once; then book anyone from their conversation, or share your booking page and let them pick a time. The confirmation is sent for you." : "Bookings made from a conversation or your public booking page show up here — on the calendar, with the confirmation sent for you."}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href="/dashboard/settings?tab=business" className="inline-flex items-center h-9 px-3.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Set your services and hours</Link>
              <Link href="/dashboard/inbox" className="inline-flex items-center h-9 px-3.5 rounded-full border border-border bg-white text-sm font-semibold text-ink hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Book from a conversation</Link>
            </div>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState title={scope === "upcoming" ? "Nothing coming up" : scope === "past" ? "Nothing completed yet" : "No canceled bookings"} description={scope === "upcoming" ? "Book someone from their thread, or share your booking page and let them pick a time." : undefined} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className={cn("px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.14em]", g.label === "Today" ? "text-accent-text" : "text-ink/65")}>{g.label}</h2>
              <ol className="rounded-[22px] border border-border bg-white divide-y divide-border overflow-hidden">
                {g.items.map((b) => {
                  const start = toZonedDisplayDate(b.startAt, tz);
                  const st = STATUS[b.status] ?? { tone: "neutral" as const, label: b.status.toLowerCase() };
                  return (
                    <li key={b.id}>
                      <Link href={`/dashboard/bookings/${b.id}`} className="flex items-center gap-3.5 px-4 md:px-5 py-3.5 hover:bg-black/[0.02] active:bg-black/[0.04] transition-colors">
                        <div className="w-12 shrink-0 text-center rounded-xl border border-border bg-paper py-1.5">
                          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink/65 leading-none">{format(start, "EEE")}</div>
                          <div className="text-lg font-extrabold text-ink leading-tight tabular-nums">{format(start, "d")}</div>
                        </div>
                        <span className="hidden sm:flex w-8 h-8 rounded-full bg-accent-soft text-accent-text items-center justify-center text-[11px] font-semibold shrink-0">{initials(b.client.name)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-ink truncate">{b.client.name}</span>
                            <Badge tone={st.tone}>{st.label}</Badge>
                          </div>
                          <div className="text-xs text-ink/65 truncate mt-0.5">
                            {format(start, "h:mm a")} · {b.service.name}{b.location ? <span className="inline-flex items-center gap-0.5"> · <MapPin className="w-3 h-3" strokeWidth={2} aria-hidden />{b.location}</span> : null}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold text-ink tabular-nums">{formatMoney(b.totalCents)}</div>
                          <div className="text-[11px] text-ink/65">{b.service.durationMins} min</div>
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
