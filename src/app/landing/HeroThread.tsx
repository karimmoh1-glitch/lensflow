"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The hero visual: the apps on the left, Daythread on the right, and a thread between them
 * that a message actually travels. Every few seconds one channel lights up, its message
 * runs the connector into the panel, and the panel reads it — who it is, what it's worth,
 * what happens next — on the same thread grammar the app uses.
 *
 * First paint is the completed panel (the richest frame), so it's whole before JavaScript
 * and in any screenshot. Reduced motion: that frame, still.
 */
type Key = "instagram" | "gmail" | "sms" | "messenger" | "whatsapp";

const CHANNELS: { key: Key; name: string; bg: string; brand: string; glyph: React.ReactNode }[] = [
  {
    key: "instagram", name: "Instagram", brand: "#D62976", bg: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]",
    glyph: <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="5.5" stroke="white" strokeWidth="1.9" /><circle cx="12" cy="12" r="4.2" stroke="white" strokeWidth="1.9" /><circle cx="17.2" cy="6.8" r="1.2" fill="white" /></svg>,
  },
  {
    key: "gmail", name: "Gmail", brand: "#EA4335", bg: "bg-[#EA4335]",
    glyph: <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><rect x="3" y="5" width="18" height="14" rx="2.5" stroke="white" strokeWidth="1.9" /><path d="M4 6.5L12 13L20 6.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  },
  {
    key: "sms", name: "Messages", brand: "#2FC26E", bg: "bg-[#2FC26E]",
    glyph: <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><path d="M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5H9l-4 3.5V16h-.5C3.7 16 3 15.3 3 14.5v-9z" fill="white" /></svg>,
  },
  {
    key: "whatsapp", name: "WhatsApp", brand: "#25D366", bg: "bg-[#25D366]",
    glyph: <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3Z" stroke="white" strokeWidth="1.9" strokeLinejoin="round" /><path d="M9 8.5c.3 2.5 2.5 4.7 5 5l1.2-1.2 1.8.9-.3 1.5c-3.8.5-8.3-4-7.9-7.9l1.5-.3.9 1.8L9 8.5Z" fill="white" /></svg>,
  },
  {
    key: "messenger", name: "Messenger", brand: "#8134F5", bg: "bg-gradient-to-br from-[#00B2FF] to-[#8134F5]",
    glyph: <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><path d="M12 3.5C6.75 3.5 2.5 7.34 2.5 12.06c0 2.64 1.35 5 3.46 6.55.18.13.3.34.3.57l.06 1.83a.72.72 0 0 0 1.01.65l2.04-.9a1 1 0 0 1 .68-.04c.6.16 1.24.24 1.95.24 5.25 0 9.5-3.84 9.5-8.9S17.25 3.5 12 3.5Z" fill="white" /></svg>,
  },
];

const STORIES: Record<Key, { who: string; msg: string; ctx: string; next: string }> = {
  instagram: { who: "Maya Chen", msg: "Are you free Tuesday?", ctx: "Returning · $2,150 lifetime", next: "Booked Tue 2:00 · deposit paid" },
  gmail: { who: "Jordan Lee", msg: "Pricing for September?", ctx: "Warm lead · asked twice", next: "Pricing sent · follow-up set" },
  sms: { who: "(512) 555-0148", msg: "Anything open next week?", ctx: "New lead · contact created", next: "Booking link sent" },
  whatsapp: { who: "Sam Okafor", msg: "Can we move to 4pm?", ctx: "Client · booked Thu", next: "Moved to 4:00 · confirmed" },
  messenger: { who: "Priya Patel", msg: "Let’s do the full package!", ctx: "Client · $175 balance open", next: "Full package booked · $1,800" },
};

// Panel input point, in the 120x300 gutter's coordinates
const IN: [number, number] = [120, 150];

export function HeroThread() {
  // `active` is the channel lit up on the left; `shown` is the story the panel is reading.
  // They differ only while a message is in flight (phase 0), when the panel keeps the last
  // story, dimmed, instead of going blank.
  const [active, setActive] = useState<Key>("instagram");
  const [shown, setShown] = useState<Key>("instagram");
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(3); // 0 in flight, 1 arrived, 2 read, 3 done
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      return;
    }
    let i = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    const run = () => {
      i = (i + 1) % CHANNELS.length;
      const next = CHANNELS[i].key;
      setActive(next);
      setPhase(0);
      later(() => {
        setShown(next);
        setPhase(1);
      }, 800);
      later(() => setPhase(2), 1600);
      later(() => setPhase(3), 2400);
      later(run, 5000);
    };
    later(run, 3600);
    return () => timers.forEach(clearTimeout);
  }, []);

  const s = STORIES[shown];
  const ch = CHANNELS.find((c) => c.key === active)!;
  const inFlight = phase === 0;

  return (
    <div className="relative w-full max-w-[640px] mx-auto select-none grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[72px_88px_minmax(0,1fr)] items-center" aria-label="Messages from Instagram, Gmail, Messages, WhatsApp and Messenger flowing into one Daythread">
      {/* Channels */}
      <ul className="flex flex-col gap-3.5 sm:gap-4">
        {CHANNELS.map((c) => {
          const on = c.key === active;
          return (
            <li key={c.key} className="flex items-center gap-2">
              <span
                className={cn("w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-400 ease-[cubic-bezier(0.22,1.2,0.36,1)]", c.bg, on ? "scale-110 -translate-y-px" : "scale-100 opacity-80")}
                style={{ boxShadow: on ? `0 12px 28px -10px ${c.brand}` : "0 4px 12px -6px rgba(16,17,20,0.25)" }}
                title={c.name}
              >
                {c.glyph}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Connectors (sm+) */}
      <svg className="hidden sm:block w-full h-[300px]" viewBox="0 0 120 300" preserveAspectRatio="none" fill="none" aria-hidden>
        <defs>
          <linearGradient id="dt-hero-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={ch.brand} />
            <stop offset="0.6" stopColor="#6D5AE6" />
            <stop offset="1" stopColor="#13CC78" />
          </linearGradient>
        </defs>
        {CHANNELS.map((c, i) => {
          const y = 30 + i * 60;
          const d = `M 0 ${y} C 55 ${y}, 60 ${IN[1]}, ${IN[0]} ${IN[1]}`;
          const on = c.key === active;
          return (
            <g key={c.key}>
              <path d={d} stroke="rgba(16,17,20,0.09)" strokeWidth="1.5" />
              <path d={d} stroke="url(#dt-hero-grad)" strokeWidth="2.5" strokeLinecap="round" className="transition-opacity duration-300" style={{ opacity: on ? 1 : 0 }} />
              {on && !still && phase === 0 && (
                <circle r="3.5" fill={c.brand}>
                  <animateMotion dur="0.85s" begin="0s" fill="freeze" path={d} />
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      {/* Daythread */}
      <div className="rounded-[20px] border border-border bg-white shadow-[0_24px_64px_-24px_rgba(16,17,20,0.28),0_2px_6px_rgba(16,17,20,0.06)] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-paper/70">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-ink" fill="none"><path d="M4 18C9 18 9 6 15 6C17 6 18.5 7.5 20 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
          <span className="text-[13px] font-extrabold tracking-tight text-ink">Daythread</span>
          <span className={cn("ml-auto w-2 h-2 rounded-full transition-colors duration-300", phase === 0 ? "bg-accent" : phase < 3 ? "bg-signal" : "bg-success")} />
        </div>
        <ol className={cn("relative pl-9 pr-4 py-3 min-h-[212px] transition-opacity duration-500", inFlight && !still ? "opacity-40" : "opacity-100")}>
          <span aria-hidden className="absolute left-[19px] top-4 bottom-4 w-px bg-border" />
          <span aria-hidden className="absolute left-[19px] top-4 w-px bg-gradient-to-b from-accent via-signal to-success origin-top transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ height: "calc(100% - 2rem)", transform: `scaleY(${still || inFlight ? 1 : phase / 3})` }} />
          <Node on={still || inFlight || phase >= 1} kind="signal" label={CHANNELS.find((c) => c.key === shown)!.name}>
            <span className="font-semibold">{s.who}</span> <span className="text-ink/70">“{s.msg}”</span>
          </Node>
          <Node on={still || inFlight || phase >= 2} kind="thinking" label="Daythread knows">
            {s.ctx}
          </Node>
          <Node on={still || inFlight || phase >= 3} kind="outcome" label="Done">
            {s.next}
          </Node>
        </ol>
      </div>
    </div>
  );
}

const DOT = { signal: "bg-accent", thinking: "bg-signal", outcome: "bg-success" } as const;
const LABEL = { signal: "text-accent-text", thinking: "text-signal-text", outcome: "text-success-text" } as const;

function Node({ on, kind, label, children }: { on: boolean; kind: keyof typeof DOT; label: string; children: React.ReactNode }) {
  return (
    <li className={cn("relative py-2.5 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", on ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2")}>
      <span aria-hidden className={cn("absolute -left-[26px] top-[15px] w-[15px] h-[15px] rounded-full border-[3px] border-white transition-transform duration-300", DOT[kind], on ? "scale-100" : "scale-0")} />
      <div className={cn("text-[10px] font-bold uppercase tracking-[0.12em] mb-0.5", LABEL[kind])}>{label}</div>
      <div className="text-sm text-ink">{children}</div>
    </li>
  );
}
