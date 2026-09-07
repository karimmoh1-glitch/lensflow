import Link from "next/link";
import { format, isSameDay } from "date-fns";
import { cn, toZonedDisplayDate } from "@/lib/utils";
import type { DayAgenda } from "@/server/dayAgenda";

/**
 * The week as a time grid: seven columns, working hours on white, everything else on
 * paper, bookings as blocks you can open, busy time from connected calendars in grey, and
 * a line where "now" is. Server-rendered — the line sits where the clock was when the page
 * was built, in the business's timezone. Scrolls sideways on a phone rather than shrinking.
 */
type Props = { week: Date[]; agendas: DayAgenda[]; timezone: string; today: Date; selected: Date; dayKey: (d: Date) => string };

const PX_PER_MIN = 0.9; // 54px per hour

export function WeekGrid({ week, agendas, timezone, today, selected, dayKey }: Props) {
  // Grid bounds: the earliest working start and latest working end across the week, padded
  // to whole hours, with a sensible default when no hours are set.
  const mins = (d: Date) => { const z = toZonedDisplayDate(d, timezone); return z.getHours() * 60 + z.getMinutes(); };
  const items = agendas.flatMap((a) => a.items.filter((i) => i.kind === "booking" || !i.allDay));
  const starts = [...agendas.flatMap((a) => a.working.map((w) => mins(w.startAt))), ...items.map((i) => mins(i.startAt))];
  const ends = [...agendas.flatMap((a) => a.working.map((w) => mins(w.endAt) || 24 * 60)), ...items.map((i) => Math.max(mins(i.endAt), mins(i.startAt) + 30))];
  const startHour = Math.max(0, Math.floor((starts.length ? Math.min(...starts) : 9 * 60) / 60) - 1);
  const endHour = Math.min(24, Math.ceil((ends.length ? Math.max(...ends) : 18 * 60) / 60) + 1);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const top = (m: number) => (m - startHour * 60) * PX_PER_MIN;
  const height = (endHour - startHour) * 60 * PX_PER_MIN;
  const nowZ = toZonedDisplayDate(new Date(), timezone);
  const nowMin = nowZ.getHours() * 60 + nowZ.getMinutes();
  const t = (d: Date) => format(toZonedDisplayDate(d, timezone), "h:mm a");

  return (
    <section aria-label="Week" className="rounded-[22px] border border-border bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          {/* day headers */}
          <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border">
            <div />
            {week.map((d, i) => {
              const isToday = isSameDay(d, today);
              const sel = isSameDay(d, selected);
              const allDay = agendas[i].items.filter((it) => it.kind === "busy" && it.allDay);
              return (
                <Link key={dayKey(d)} href={`?view=week&day=${dayKey(d)}`} className={cn("px-2 py-2.5 text-center border-l border-border hover:bg-black/[0.02]", sel && "bg-paper")} aria-current={isToday ? "date" : undefined}>
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/60">{format(d, "EEE")}</div>
                  <div className={cn("mx-auto mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-sm font-extrabold tabular-nums", isToday ? "bg-accent-strong text-white" : "text-ink")}>{format(d, "d")}</div>
                  {allDay.length > 0 && <div className="mt-1 text-[10px] font-semibold text-ink/60 truncate" title={allDay.map((a) => a.title).join(", ")}>{allDay.length === 1 ? allDay[0].title : `${allDay.length} all-day`}</div>}
                </Link>
              );
            })}
          </div>
          {/* time grid */}
          <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]" style={{ height }}>
            <div className="relative">
              {hours.map((h) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-ink/60 tabular-nums" style={{ top: top(h * 60) }}>{h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}</span>
              ))}
            </div>
            {week.map((d, i) => {
              const a = agendas[i];
              const isToday = isSameDay(d, today);
              return (
                <div key={dayKey(d)} className={cn("relative border-l border-border", a.blocked ? "bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(16,17,20,0.04)_6px,rgba(16,17,20,0.04)_7px)]" : "bg-paper/60")}>
                  {/* working hours */}
                  {a.working.map((w) => (
                    <span key={w.startAt.toISOString()} aria-hidden className="absolute inset-x-0 bg-white" style={{ top: top(mins(w.startAt)), height: Math.max(0, (mins(w.endAt) || 24 * 60) - mins(w.startAt)) * PX_PER_MIN }} />
                  ))}
                  {hours.map((h) => (
                    <span key={h} aria-hidden className="absolute inset-x-0 border-t border-border/70" style={{ top: top(h * 60) }} />
                  ))}
                  {/* items */}
                  {a.items.filter((it) => it.kind === "booking" || !it.allDay).map((it) => {
                    const s = mins(it.startAt);
                    const e = Math.max(mins(it.endAt), s + 30);
                    const style = { top: top(s) + 1, height: (e - s) * PX_PER_MIN - 2 };
                    if (it.kind === "booking") {
                      return (
                        <Link key={it.id} href={`/dashboard/bookings/${it.id}`} className={cn("absolute left-1 right-1 rounded-md border px-1.5 py-1 overflow-hidden text-left hover:brightness-95 transition-[filter]", it.status === "BOOKED" ? "bg-warning-soft border-warning/40" : "bg-accent-soft border-accent/40")} style={style} title={`${it.title} · ${t(it.startAt)}–${t(it.endAt)}`}>
                          <div className={cn("text-[11px] font-bold leading-tight truncate", it.status === "BOOKED" ? "text-warning-text" : "text-accent-text")}>{it.title}</div>
                          <div className="text-[10px] text-ink/60 leading-tight truncate tabular-nums">{t(it.startAt)}{it.status === "BOOKED" ? " · not confirmed" : ""}</div>
                        </Link>
                      );
                    }
                    return (
                      <div key={it.id} className="absolute left-1 right-1 rounded-md bg-ink/[0.07] border border-ink/10 px-1.5 py-1 overflow-hidden" style={style} title={`${it.title} · ${it.subtitle}`}>
                        <div className="text-[11px] font-semibold text-ink/70 leading-tight truncate">{it.title}</div>
                        <div className="text-[10px] text-ink/60 leading-tight truncate">{it.subtitle}</div>
                      </div>
                    );
                  })}
                  {/* now */}
                  {isToday && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
                    <div aria-label={`Now, ${format(nowZ, "h:mm a")}`} className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: top(nowMin) }}>
                      <span className="absolute -left-[5px] -top-[4px] w-[9px] h-[9px] rounded-full bg-accent ring-2 ring-white" />
                      <span className="block h-px bg-accent" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
