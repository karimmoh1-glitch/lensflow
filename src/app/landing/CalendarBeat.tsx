"use client";

import { CalendarDays, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelIcon } from "./ChannelIcon";
import { useScrollProgress, seg } from "./useScrollProgress";

/**
 * The calendar lives inside the conversation. One message — "can we move Thursday to
 * 4pm?" — is read, the booking slides on the week, and the confirmation goes back out on
 * the same channel. Driven by scroll, reversible; reduced motion resolves to the moved
 * state. Illustrative: the person is fiction, the mechanics are the product's.
 */
const HOURS = ["1 PM", "2 PM", "3 PM", "4 PM", "5 PM"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function CalendarBeat() {
  const { ref, p } = useScrollProgress<HTMLDivElement>("enter", 0.3);
  const arrive = seg(p, 0.0, 0.2);
  const read = seg(p, 0.2, 0.42);
  const move = seg(p, 0.45, 0.72);
  const sent = seg(p, 0.76, 0.95);
  const rowH = 34; // px per hour on the mini week
  const top = 1 * rowH + move * 2 * rowH; // 2 PM → 4 PM

  return (
    <div ref={ref} className="max-w-[1200px] mx-auto px-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-10 lg:gap-16 items-center">
        <div className="relative order-2 lg:order-1">
          {/* the message, arriving on WhatsApp */}
          <div className="absolute -top-5 left-4 z-10 w-[min(300px,82%)]" style={{ opacity: arrive, transform: `translateY(${(1 - arrive) * 14}px)` }}>
            <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-white shadow-popover px-3 py-2.5">
              <ChannelIcon k="whatsapp" size={30} />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-ink">Sam Okafor <span className="font-normal text-ink/45">· now</span></div>
                <div className="text-[13px] text-ink truncate">Can we move Thursday to 4pm?</div>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-border bg-white shadow-[0_32px_80px_-32px_rgba(16,17,20,0.3)] overflow-hidden pt-9">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              {/* what Daythread read */}
              <div className="px-5 py-4 border-b md:border-b-0 md:border-r border-border md:flex md:flex-col md:justify-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-signal-text mb-2">Daythread read this</div>
                <dl className="space-y-1.5 text-[13px]">
                  {[
                    ["Who", "Sam Okafor · customer"],
                    ["Intent", "Reschedule"],
                    ["To", "Thursday · 4:00 PM"],
                    ["Open?", "Yes — nothing else at 4"],
                  ].map(([k, v], i) => {
                    const t = seg(read, i * 0.2, i * 0.2 + 0.4);
                    return (
                      <div key={k} className="flex items-baseline justify-between gap-3" style={{ opacity: 0.25 + t * 0.75, transform: `translateX(${(1 - t) * -6}px)` }}>
                        <dt className="text-ink/50">{k}</dt>
                        <dd className={cn("font-medium text-right", i === 3 ? "text-success-text" : "text-ink")}>{v}</dd>
                      </div>
                    );
                  })}
                </dl>
                <div className="mt-4 rounded-xl bg-ink text-white text-[13px] font-semibold px-3 py-2 text-center" style={{ opacity: 0.3 + move * 0.7 }}>
                  Move it to Thursday at 4:00 PM
                </div>
              </div>

              {/* the week, with the booking sliding */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45"><CalendarDays className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />This week</div>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-ink/45"><span className="w-1.5 h-1.5 rounded-full bg-success" />Google Calendar · synced</div>
                </div>
                <div className="grid grid-cols-[34px_repeat(5,1fr)] text-[10px] text-ink/45 mb-1">
                  <span />
                  {DAYS.map((d) => <span key={d} className={cn("text-center font-semibold", d === "Thu" && "text-ink")}>{d}</span>)}
                </div>
                <div className="relative grid grid-cols-[34px_repeat(5,1fr)]" style={{ height: rowH * HOURS.length }}>
                  {HOURS.map((h, i) => (
                    <span key={h} className="text-[10px] text-ink/40 tabular-nums" style={{ position: "absolute", left: 0, top: i * rowH - 6 }}>{h}</span>
                  ))}
                  {DAYS.map((d, di) => (
                    <div key={d} className="relative" style={{ gridColumn: di + 2 }}>
                      {HOURS.map((h, i) => <span key={h} aria-hidden className="absolute left-0 right-0 border-t border-border/70" style={{ top: i * rowH }} />)}
                      {/* busy time from the external calendar */}
                      {d === "Tue" && <span aria-hidden className="absolute left-1 right-1 rounded-md bg-ink/[0.06]" style={{ top: 2 * rowH + 2, height: rowH - 4 }} />}
                      {d === "Fri" && <span aria-hidden className="absolute left-1 right-1 rounded-md bg-ink/[0.06]" style={{ top: 0 * rowH + 2, height: rowH * 2 - 4 }} />}
                      {d === "Thu" && (
                        <>
                          {/* the old slot, releasing */}
                          <span aria-hidden className="absolute left-1 right-1 rounded-md border border-dashed border-accent/50" style={{ top: 1 * rowH + 2, height: rowH * 1.5 - 4, opacity: move }} />
                          <div className="absolute left-1 right-1 rounded-md bg-accent-soft border border-accent/40 px-1.5 py-1 overflow-hidden" style={{ top: top + 2, height: rowH * 1.5 - 4, boxShadow: `0 ${move * 8}px ${move * 20}px -8px rgba(240,82,77,0.5)` }}>
                            <div className="text-[10px] font-bold text-accent-text leading-tight truncate">Sam</div>
                            <div className="text-[9px] text-ink/60 leading-tight truncate tabular-nums">{move > 0.5 ? "4:00" : "2:00"} PM</div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {/* the confirmation going back out */}
                <div className="mt-3 flex items-start gap-2" style={{ opacity: sent, transform: `translateY(${(1 - sent) * 6}px)` }}>
                  <ChannelIcon k="whatsapp" size={18} />
                  <div className="min-w-0">
                    <p className="text-xs text-ink/70 leading-relaxed">“Hi Sam — moved to Thursday at 4:00 PM. See you then!”</p>
                    <p className="text-[10px] font-semibold text-success-text flex items-center gap-1 mt-0.5"><Check className="w-3 h-3" strokeWidth={2.5} aria-hidden />Sent · calendar updated</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text mb-4">Calendar</p>
          <h2 className="font-sans font-extrabold text-[clamp(2.4rem,4.4vw,3.9rem)] leading-[0.94] tracking-[-0.045em] text-ink">
            The calendar is<br />in the conversation.
          </h2>
          <p className="mt-5 text-ink/60 text-base max-w-sm">
            A message asks for a time. Daythread checks what&rsquo;s open — bookings, buffers, your Google or Apple calendar — and the booking moves from the thread. The confirmation goes back on the channel they wrote from.
          </p>
        </div>
      </div>
    </div>
  );
}
