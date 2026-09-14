"use client";

import { CalendarDays, Sparkles, Zap, UserPlus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelIcon } from "./ChannelIcon";
import { Reveal } from "./Reveal";
import { useScrollProgress, seg } from "./useScrollProgress";

/**
 * The question a skeptic asks: why not Gmail + Instagram + WhatsApp + a calendar + a
 * scheduling tool + an automation tool, separately? Because none of them know what the
 * message is. Daythread keeps the conversation attached to what it becomes. Left: the
 * cost of the scattered way, plainly. Right: one message, and everything it can turn into,
 * drawn as you scroll. Illustrative; the branches are real product features.
 */
const COST = [
  ["Missed messages", "A DM answered a week late is a customer who booked elsewhere."],
  ["Slow replies", "Five tabs means nobody gets answered first."],
  ["Forgotten follow-ups", "The quote you sent on Tuesday is the one you forgot on Friday."],
  ["Manual scheduling", "Copying a date from a message into a calendar, by hand, every time."],
  ["No context", "Which Sarah? What did we agree? What did she pay last time?"],
];
const BECOMES = [
  { icon: CalendarDays, label: "a booking", sub: "on the calendar, confirmed" },
  { icon: Zap, label: "an automation", sub: "reminder, thank-you, follow-up" },
  { icon: Sparkles, label: "a proposal", sub: "from the assistant, for approval" },
  { icon: UserPlus, label: "an assignment", sub: "to the person who should answer" },
];

export function Why() {
  const { ref, p } = useScrollProgress<HTMLDivElement>("enter", 0.3);
  const arrive = seg(p, 0, 0.2);
  const know = seg(p, 0.2, 0.45);
  const branch = seg(p, 0.45, 0.95);

  return (
    <div ref={ref} className="max-w-[1200px] mx-auto px-6">
      <Reveal className="max-w-2xl mb-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text mb-4">Why Daythread</p>
        <h2 className="font-sans font-extrabold text-[clamp(2.4rem,4.6vw,4rem)] leading-[0.94] tracking-[-0.045em] text-ink">Five tools don&rsquo;t know what the message is.</h2>
        <p className="mt-5 text-ink/70 text-base max-w-lg">Gmail, Instagram, WhatsApp, a calendar and a scheduling link each hold a piece. None of them know that “are you free Friday?” is a booking waiting to happen. Daythread keeps the conversation attached to what it becomes.</p>
      </Reveal>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-10 lg:gap-16 items-start">
        {/* The scattered way, and what it costs. */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65 mb-4">What the scattered way costs</p>
          <p className="mb-5 text-lg font-extrabold tracking-tight text-ink leading-snug">One missed booking can cost more than a month of Daythread.<br /><span className="font-medium text-ink/70">If a customer can reach you in five places, you shouldn&rsquo;t have to check five places.</span></p>
          <ul className="divide-y divide-border border-y border-border">
            {COST.map(([t, d], i) => (
              <li key={t} className="py-3.5 flex items-start gap-3" style={{ opacity: seg(arrive, i * 0.15, i * 0.15 + 0.4), transform: `translateY(${(1 - seg(arrive, i * 0.15, i * 0.15 + 0.4)) * 8}px)` }}>
                <span aria-hidden className="mt-2 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <div><div className="text-sm font-semibold text-ink">{t}</div><div className="text-sm text-ink/70">{d}</div></div>
              </li>
            ))}
          </ul>
        </div>

        {/* One message, and everything it can become. */}
        <div className="relative rounded-[22px] border border-border bg-white shadow-[0_32px_80px_-32px_rgba(16,17,20,0.3)] p-5 sm:p-6">
          <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-paper px-3 py-2.5 w-fit max-w-full">
            <ChannelIcon k="instagram" size={30} />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-ink">Nadia Okoro <span className="font-normal text-ink/60">· Instagram</span></div>
              <div className="text-[13px] text-ink truncate">Are you free Friday afternoon for a brand session?</div>
            </div>
          </div>

          <div className="mt-3 ml-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-signal-text" style={{ opacity: know }}>
            <MessageSquare className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />Daythread read it: booking request · Friday PM · returning customer
          </div>

          <div className="relative mt-4 ml-4 pl-6">
            <span aria-hidden className="absolute left-0 top-0 bottom-4 w-px bg-ink/10" />
            <span aria-hidden className="absolute left-0 top-0 w-px bg-gradient-to-b from-accent via-signal to-success origin-top" style={{ height: "calc(100% - 1rem)", transform: `scaleY(${branch})` }} />
            <ul className="space-y-2.5">
              {BECOMES.map((b, i) => {
                const t = seg(branch, i * 0.22, i * 0.22 + 0.35);
                return (
                  <li key={b.label} className="relative flex items-center gap-3" style={{ opacity: t, transform: `translateX(${(1 - t) * -8}px)` }}>
                    <span aria-hidden className="absolute -left-6 top-1/2 w-6 h-px bg-ink/15" />
                    <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", i === 0 ? "bg-accent-soft text-accent-text" : i === 1 ? "bg-signal-soft text-signal-text" : i === 2 ? "bg-signal-soft text-signal-text" : "bg-success-soft text-success-text")}>
                      <b.icon className="w-4 h-4" strokeWidth={2} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink"><span className="text-ink/60 font-medium">becomes </span>{b.label}</div>
                      <div className="text-xs text-ink/65">{b.sub}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="mt-5 text-xs text-ink/65">Every step lands back in the thread, so the next time Nadia writes, all of it is beside her message.</p>
        </div>
      </div>
    </div>
  );
}
