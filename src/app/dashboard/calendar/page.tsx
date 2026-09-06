import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBusiness, homeRouteFor, STAFF_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDayAgenda } from "@/server/dayAgenda";
import { ChevronLeft, ChevronRight, CalendarDays, Plus, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { cn, toZonedDisplayDate } from "@/lib/utils";

/**
 * The calendar answers two questions fast, especially on a phone:
 *   "What do I have today?"  — the day agenda: bookings and busy time on connected calendars, in order.
 *   "Am I free at 3?"        — free windows: working hours minus bookings, buffers and busy time.
 * The month grid stays for planning. Every time is shown in the business's own timezone.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; day?: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (!STAFF_ROLES.includes(ctx.role)) redirect(homeRouteFor(ctx.role, ctx.business));
  const { business } = ctx;
  const sp = await searchParams;
  const tz = business.timezone;

  // "Today" in the business's zone, as a plain calendar date.
  const todayZ = toZonedDisplayDate(new Date(), tz);
  const today = new Date(todayZ.getFullYear(), todayZ.getMonth(), todayZ.getDate());
  const selected = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? new Date(`${sp.day}T00:00:00`) : today;
  const anchor = sp.month ? new Date(`${sp.month}-01T00:00:00`) : selected;
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekStart = startOfWeek(selected);
  const week = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

  const [bookings, agenda] = await Promise.all([
    prisma.booking.findMany({
      where: { businessId: business.id, startAt: { gte: addDays(gridStart, -1), lte: addDays(gridEnd, 1) }, status: { not: "CANCELED" } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" },
    }),
    getDayAgenda(business.id, { year: selected.getFullYear(), month: selected.getMonth(), date: selected.getDate() }),
  ]);

  const byDay = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const key = format(toZonedDisplayDate(b.startAt, tz), "yyyy-MM-dd");
    byDay.set(key, [...(byDay.get(key) ?? []), b]);
  }
  const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
  const t = (d: Date) => format(toZonedDisplayDate(d, tz), "h:mm a");
  const prevMonth = format(addMonths(anchor, -1), "yyyy-MM");
  const nextMonth = format(addMonths(anchor, 1), "yyyy-MM");
  const isSelectedToday = isSameDay(selected, today);
  const attention = agenda.calendars.filter((c) => c.status === "NEEDS_ATTENTION" || c.status === "SYNC_ERROR");
  const nextFree = agenda.free.find((f) => f.endAt > new Date()) ?? agenda.free[0];

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageHeader
        title="Calendar"
        description={isSelectedToday ? "What's on today, and when you're free." : format(selected, "EEEE, MMMM d")}
        action={
          <div className="flex items-center gap-1.5">
            {!isSelectedToday && <Link href={`?day=${dayKey(today)}`} className="inline-flex items-center h-9 px-3.5 rounded-full border border-border bg-white text-sm font-semibold text-ink hover:bg-black/[0.03]">Today</Link>}
            <Link href="/dashboard/bookings" className="inline-flex items-center h-9 px-3.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-black"><Plus className="w-4 h-4 mr-1" strokeWidth={2.5} aria-hidden />Bookings</Link>
          </div>
        }
      />

      {attention.length > 0 && (
        <div role="alert" className="mb-4 rounded-2xl border border-warning/40 bg-warning-soft/60 px-4 py-3 text-sm text-ink/80 flex flex-wrap items-center gap-x-3 gap-y-1">
          <AlertTriangle className="w-4 h-4 text-warning-text shrink-0" strokeWidth={2} aria-hidden />
          <span className="flex-1"><span className="font-semibold text-ink">{attention.map((c) => (c.provider === "GOOGLE_CALENDAR" ? "Google Calendar" : "Apple Calendar")).join(" and ")}</span> {attention.length === 1 ? "isn't" : "aren't"} syncing, so busy time there may be missing here.</span>
          <Link href="/dashboard/settings?tab=connections" className="text-signal-text font-semibold hover:underline">Fix in Integrations →</Link>
        </div>
      )}

      {/* Week strip: seven big targets, the selected day solid. */}
      <div className="flex items-center gap-1 mb-4">
        <Link href={`?day=${dayKey(addDays(selected, -7))}`} aria-label="Previous week" className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-md text-ink/55 hover:text-ink hover:bg-black/[0.05]"><ChevronLeft className="w-4 h-4" strokeWidth={2} /></Link>
        <ol className="flex-1 grid grid-cols-7 gap-1">
          {week.map((d) => {
            const sel = isSameDay(d, selected);
            const count = byDay.get(dayKey(d))?.length ?? 0;
            return (
              <li key={d.toISOString()}>
                <Link href={`?day=${dayKey(d)}`} aria-current={sel ? "date" : undefined} className={cn("flex flex-col items-center rounded-2xl py-2 min-h-[3.75rem] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50", sel ? "bg-ink text-white" : "bg-white border border-border text-ink hover:bg-black/[0.03]")}>
                  <span className={cn("text-[10px] font-bold uppercase tracking-[0.1em]", sel ? "text-white/70" : "text-ink/45")}>{format(d, "EEE")}</span>
                  <span className={cn("text-lg font-extrabold tabular-nums leading-tight", !sel && isSameDay(d, today) && "text-accent-text")}>{format(d, "d")}</span>
                  <span className="h-1.5 flex items-center gap-0.5" aria-hidden>{Array.from({ length: Math.min(3, count) }).map((_, i) => <span key={i} className={cn("w-1 h-1 rounded-full", sel ? "bg-white/80" : "bg-accent")} />)}</span>
                </Link>
              </li>
            );
          })}
        </ol>
        <Link href={`?day=${dayKey(addDays(selected, 7))}`} aria-label="Next week" className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-md text-ink/55 hover:text-ink hover:bg-black/[0.05]"><ChevronRight className="w-4 h-4" strokeWidth={2} /></Link>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 mb-10">
        {/* Day agenda */}
        <section aria-label="Day agenda" className="rounded-[22px] border border-border bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">{isSelectedToday ? "Today" : format(selected, "EEEE")} <span className="text-ink/45 font-medium">· {format(selected, "MMM d")}</span></h2>
            <span className="text-xs text-ink/50">{agenda.items.length === 0 ? "Nothing scheduled" : `${agenda.items.length} ${agenda.items.length === 1 ? "item" : "items"}`}</span>
          </div>
          {agenda.items.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-success-soft text-success-text flex items-center justify-center"><CalendarDays className="w-5 h-5" strokeWidth={2} aria-hidden /></div>
              <p className="mt-3 text-sm font-semibold text-ink">{agenda.blocked ? "Blocked off." : agenda.working.length === 0 ? "Not a working day." : "Clear all day."}</p>
              <p className="mt-1 text-xs text-ink/55">{agenda.blocked ? "This date is blocked in Availability." : agenda.working.length === 0 ? "No working hours set for this weekday." : `Working ${agenda.working.map((w) => `${t(w.startAt)}–${t(w.endAt)}`).join(", ")}.`}</p>
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {agenda.items.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  {item.kind === "booking" ? (
                    <Link href={`/dashboard/bookings/${item.id}`} className="flex gap-4 px-5 py-3.5 hover:bg-black/[0.02] active:bg-black/[0.04]">
                      <div className="w-[4.5rem] shrink-0 text-right">
                        <div className="text-sm font-semibold text-ink tabular-nums">{t(item.startAt)}</div>
                        <div className="text-[11px] text-ink/45 tabular-nums">{t(item.endAt)}</div>
                      </div>
                      <div className="w-1 rounded-full bg-accent shrink-0" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-ink truncate">{item.title}</div>
                        <div className="text-xs text-ink/60 truncate">{item.subtitle}{item.location ? ` · ${item.location}` : ""}</div>
                        {(item.status === "BOOKED" || item.status === "DEPOSIT_PAID") && <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-[0.1em] text-warning-text bg-warning-soft rounded-full px-1.5 py-0.5">Not confirmed</span>}
                      </div>
                      <ChevronRight className="w-4 h-4 text-ink/30 self-center shrink-0" aria-hidden />
                    </Link>
                  ) : (
                    <div className="flex gap-4 px-5 py-3.5">
                      <div className="w-[4.5rem] shrink-0 text-right">
                        <div className="text-sm font-semibold text-ink/70 tabular-nums">{item.allDay ? "All day" : t(item.startAt)}</div>
                        {!item.allDay && <div className="text-[11px] text-ink/45 tabular-nums">{t(item.endAt)}</div>}
                      </div>
                      <div className="w-1 rounded-full bg-black/15 shrink-0" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink/80 truncate">{item.title}</div>
                        <div className="text-xs text-ink/50 truncate">{item.subtitle}</div>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Free windows */}
        <aside aria-label="Free time" className="rounded-[22px] border border-border bg-white">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="text-sm font-semibold text-ink">Free {isSelectedToday ? "today" : format(selected, "EEEE")}</h2>
            <p className="text-[11px] text-ink/50 mt-0.5">Working hours minus bookings, buffers and busy calendar time.</p>
          </div>
          <div className="px-5 py-4">
            {agenda.free.length === 0 ? (
              <p className="text-sm text-ink/60">{agenda.blocked ? "Blocked off." : agenda.working.length === 0 ? "No working hours set." : "Fully booked."}</p>
            ) : (
              <>
                {nextFree && isSelectedToday && <p className="text-sm text-ink mb-3"><span className="font-semibold">Next free:</span> {t(nextFree.startAt)} – {t(nextFree.endAt)}</p>}
                <ul className="flex flex-wrap gap-1.5">
                  {agenda.free.map((f) => (
                    <li key={f.startAt.toISOString()} className="text-xs font-semibold text-success-text bg-success-soft rounded-full px-2.5 py-1 tabular-nums">{t(f.startAt)} – {t(f.endAt)}</li>
                  ))}
                </ul>
              </>
            )}
            {agenda.calendars.length > 0 && (
              <p className="mt-4 text-[11px] text-ink/45">{agenda.calendars.map((c) => `${c.provider === "GOOGLE_CALENDAR" ? "Google" : "Apple"}${c.lastSyncedAt ? ` synced ${format(c.lastSyncedAt, "h:mm a")}` : c.status === "CONNECTED" ? " connected" : " needs attention"}`).join(" · ")}</p>
            )}
            {agenda.calendars.length === 0 && <Link href="/dashboard/settings?tab=connections" className="mt-4 inline-block text-[11px] font-semibold text-signal-text hover:underline">Connect Google or Apple Calendar so busy time counts →</Link>}
          </div>
        </aside>
      </div>

      {/* Month */}
      <section aria-label="Month">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-sans font-extrabold text-lg tracking-tight text-ink">{format(anchor, "MMMM yyyy")}</h2>
          <div className="flex items-center gap-1">
            <Link href={`?day=${dayKey(selected)}&month=${prevMonth}`} aria-label="Previous month" className="inline-flex items-center justify-center w-9 h-9 rounded-md text-ink/65 hover:text-ink hover:bg-black/[0.05]"><ChevronLeft className="w-4 h-4" strokeWidth={2} /></Link>
            <Link href={`?day=${dayKey(selected)}&month=${nextMonth}`} aria-label="Next month" className="inline-flex items-center justify-center w-9 h-9 rounded-md text-ink/65 hover:text-ink hover:bg-black/[0.05]"><ChevronRight className="w-4 h-4" strokeWidth={2} /></Link>
          </div>
        </div>
        <div className="grid grid-cols-7 text-[10px] md:text-xs font-semibold text-ink/50 mb-1.5">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="px-1 md:px-2 py-1 text-center md:text-left">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 md:gap-1.5">
          {days.map((day) => {
            const key = dayKey(day);
            const dayBookings = byDay.get(key) ?? [];
            const inMonth = isSameMonth(day, anchor);
            const sel = isSameDay(day, selected);
            return (
              <Link key={key} href={`?day=${key}`} aria-label={`${format(day, "EEEE, MMMM d")}${dayBookings.length ? `, ${dayBookings.length} booking${dayBookings.length === 1 ? "" : "s"}` : ""}`} className={cn("min-h-[3.25rem] md:min-h-28 rounded-lg md:rounded-xl border p-1.5 md:p-2 bg-white transition-colors hover:bg-black/[0.02]", !inMonth && "bg-black/[0.02] text-ink/30", isSameDay(day, today) && "border-accent ring-1 ring-accent/30", sel ? "border-ink" : "border-border")}>
                <div className={cn("text-xs font-medium mb-1 text-center md:text-left", isSameDay(day, today) && "text-accent-text")}>{format(day, "d")}</div>
                <div className="hidden md:block space-y-1">
                  {dayBookings.slice(0, 3).map((b) => (
                    <div key={b.id} className="truncate text-[11px] rounded bg-accent-soft text-accent-text px-1.5 py-0.5" title={`${t(b.startAt)} ${b.service.name} — ${b.client.name}`}>{format(toZonedDisplayDate(b.startAt, tz), "h:mma")} {b.client.name}</div>
                  ))}
                  {dayBookings.length > 3 && <div className="text-[11px] text-ink/60">+{dayBookings.length - 3} more</div>}
                </div>
                <div className="md:hidden flex justify-center gap-0.5" aria-hidden>{dayBookings.slice(0, 3).map((b) => <span key={b.id} className="w-1.5 h-1.5 rounded-full bg-accent" />)}</div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
