"use client";

import { ChannelIcon, type ChannelKey } from "./ChannelIcon";
import { useScrollProgress, seg } from "./useScrollProgress";

/**
 * The lead-in to pricing: what a business is paying for today, in attention, and what it
 * gets instead. Scroll-linked — the scattered list converges into the thread as it enters.
 */
const SCATTERED: { k?: ChannelKey; label: string }[] = [
  { k: "instagram", label: "Instagram DMs" },
  { k: "gmail", label: "Gmail" },
  { k: "sms", label: "Texts" },
  { k: "whatsapp", label: "WhatsApp" },
  { k: "website", label: "A booking page" },
  { label: "Deposits and balances" },
  { label: "Reminders and follow-ups" },
  { label: "The list in your head" },
];
const ONE = [
  ["bg-accent", "One inbox, sorted by what needs you"],
  ["bg-signal", "Who each person is, before you reply"],
  ["bg-ink/70", "Bookings and deposits from the conversation"],
  ["bg-success", "Confirmations and reminders that send themselves"],
  ["bg-signal", "Copilot that knows your whole thread"],
];

export function ValueLadder() {
  const { ref, p } = useScrollProgress<HTMLDivElement>("enter", 0.3);
  return (
    <div ref={ref} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_64px_minmax(0,1.1fr)] gap-6 md:gap-0 items-center mb-16 md:mb-24">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/40 mb-4">What you&rsquo;re paying today</p>
        <ul className="space-y-2">
          {SCATTERED.map((s, i) => {
            const t = seg(p, 0.05 + i * 0.05, 0.35 + i * 0.05);
            return (
              <li key={s.label} className="flex items-center gap-3 text-sm font-semibold text-ink" style={{ opacity: 1 - t * 0.6, transform: `translateX(${t * 14}px)` }}>
                {s.k ? <ChannelIcon k={s.k} size={24} /> : <span className="w-6 h-6 rounded-md bg-black/[0.05] shrink-0" />}
                <span className="relative">
                  {s.label}
                  <span aria-hidden className="absolute left-0 top-1/2 h-px bg-ink/40 origin-left" style={{ width: "100%", transform: `scaleX(${t})` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="hidden md:block relative h-full min-h-[240px]">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 64 240" preserveAspectRatio="none" fill="none" aria-hidden>
          <defs><linearGradient id="dt-ladder" x1="0" x2="1"><stop offset="0" stopColor="#F0524D" /><stop offset="0.5" stopColor="#6D5AE6" /><stop offset="1" stopColor="#13CC78" /></linearGradient></defs>
          {SCATTERED.map((_, i) => {
            const y = 14 + i * 30;
            return <path key={i} d={`M 0 ${y} C 32 ${y}, 32 120, 64 120`} stroke="url(#dt-ladder)" strokeWidth="1.5" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - seg(p, 0.15 + i * 0.04, 0.6 + i * 0.04)} />;
          })}
        </svg>
      </div>
      <div className="rounded-[22px] border border-border bg-white shadow-[0_24px_64px_-28px_rgba(16,17,20,0.3)] p-5" style={{ opacity: 0.4 + seg(p, 0.3, 0.7) * 0.6, transform: `translateY(${(1 - seg(p, 0.3, 0.7)) * 12}px)` }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text mb-3">What you get instead</p>
        <ol className="relative pl-6">
          <span aria-hidden className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
          {ONE.map(([dot, label], i) => {
            const t = seg(p, 0.35 + i * 0.07, 0.6 + i * 0.07);
            return (
              <li key={label} className="relative py-1.5 text-sm font-semibold text-ink" style={{ opacity: t, transform: `translateX(${(1 - t) * -8}px)` }}>
                <span aria-hidden className={`absolute -left-6 top-[10px] w-[11px] h-[11px] rounded-full border-2 border-white ${dot}`} />
                {label}
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-xs text-ink/50">For less than one missed booking.</p>
      </div>
    </div>
  );
}
