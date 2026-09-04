"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ChannelIcon, CHANNEL, type ChannelKey } from "@/app/landing/ChannelIcon";

/**
 * The product, alive behind the form. Five channels on the left; a message from one of them
 * travels a short thread into a compact Daythread panel that reads it — who, what, what's
 * next. Slow, quiet, looping. Reduced motion: the resolved frame, still.
 */
const STORIES: { k: ChannelKey; who: string; msg: string; ctx: string; next: string }[] = [
  { k: "instagram", who: "Maya Chen", msg: "Are you free Tuesday?", ctx: "Returning · $2,150 lifetime", next: "Offer Tuesday 2:00 PM" },
  { k: "gmail", who: "Jordan Lee", msg: "Pricing for September?", ctx: "Warm lead · asked twice", next: "Send the pricing sheet" },
  { k: "sms", who: "(512) 555-0148", msg: "Anything open next week?", ctx: "New lead · contact created", next: "Send your booking link" },
  { k: "whatsapp", who: "Sam Okafor", msg: "Move Thursday to 4pm?", ctx: "Client · booked Thursday", next: "Confirm 4:00 PM" },
  { k: "website", who: "Priya Patel", msg: "Booked the Full package", ctx: "New client · $540 deposit paid", next: "Nothing — it handled itself" },
];

export function AuthEnvironment() {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<0 | 1 | 2>(2);
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      return;
    }
    let idx = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = () => {
      idx = (idx + 1) % STORIES.length;
      setI(idx);
      setPhase(0);
      timers.push(setTimeout(() => setPhase(1), 700));
      timers.push(setTimeout(() => setPhase(2), 1500));
    };
    const loop = setInterval(tick, 5200);
    return () => {
      clearInterval(loop);
      timers.forEach(clearTimeout);
    };
  }, []);

  const s = STORIES[i];
  const brand = CHANNEL[s.k].brand;
  const on = (n: number) => still || phase >= n;

  return (
    <div className="grid grid-cols-[48px_56px_minmax(0,1fr)] lg:grid-cols-[56px_72px_minmax(0,1fr)] items-center max-w-md">
      <ul className="flex flex-col gap-2 lg:gap-3">
        {STORIES.map((st) => (
          <li key={st.k} className="h-9 lg:h-11 flex items-center">
            <ChannelIcon k={st.k} size={36} active={st.k === s.k} className={st.k === s.k ? "" : "opacity-40"} />
          </li>
        ))}
      </ul>
      <svg className="h-[220px] lg:h-[280px] w-full" viewBox="0 0 72 280" preserveAspectRatio="none" fill="none" aria-hidden>
        {STORIES.map((st, n) => {
          const y = 28 + n * 56;
          const d = `M 0 ${y} C 36 ${y}, 36 140, 72 140`;
          const isOn = st.k === s.k;
          return (
            <g key={st.k}>
              <path d={d} stroke="rgba(250,250,249,0.10)" strokeWidth="1.5" />
              <path d={d} stroke={brand === "#101114" ? "#FAFAF9" : brand} strokeWidth="2" strokeLinecap="round" className="transition-opacity duration-500" style={{ opacity: isOn ? 0.9 : 0 }} />
              {isOn && !still && phase === 0 && (
                <circle r="3.5" fill={brand === "#101114" ? "#FAFAF9" : brand}>
                  <animateMotion dur="0.7s" fill="freeze" path={d} />
                </circle>
              )}
            </g>
          );
        })}
      </svg>
      <div className="rounded-2xl border border-paper/10 bg-paper/[0.04] backdrop-blur-sm p-4 min-h-[168px] flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full transition-colors duration-500" style={{ background: brand === "#101114" ? "#FAFAF9" : brand }} />
          <span className="text-[11px] font-bold text-paper/60 uppercase tracking-[0.12em]">{CHANNEL[s.k].name}</span>
        </div>
        <div className={cn("transition-all duration-500", on(1) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1")}>
          <div className="text-sm font-semibold text-paper">{s.who}</div>
          <div className="text-sm text-paper/60">“{s.msg}”</div>
        </div>
        <div className={cn("mt-3 text-xs text-signal transition-all duration-500", on(2) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1")}>
          <span className="text-paper/40 uppercase tracking-[0.12em] font-bold text-[10px] mr-2">Knows</span>
          <span className="text-paper/80">{s.ctx}</span>
        </div>
        <div className={cn("mt-auto pt-3 flex items-center gap-2 text-xs transition-all duration-500", on(2) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1")}>
          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
          <span className="font-semibold text-paper">{s.next}</span>
        </div>
      </div>
    </div>
  );
}
