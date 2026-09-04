"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The emotional payoff, given its own dark stage. On the left, the business as it
 * actually is: activity that never stops, scrolling past, dim. On the right, what
 * Daythread does with all of it — one card, in the brand's action color, saying the one
 * thing that matters right now. The card lands when the section comes into view.
 */
const ACTIVITY = [
  ["Instagram", "Maya: Hey! Are you free Tuesday?"],
  ["Gmail", "Jordan: Re: invoice for last month?"],
  ["Messages", "(512) 555-0148: anything open next week?"],
  ["Payment", "$540 deposit · Priya Patel"],
  ["Booking page", "Priya booked the Full package"],
  ["WhatsApp", "Sam: can we move Thursday to 4?"],
  ["Calendar", "Consult · Jordan · 10:00"],
  ["Task", "Send Maya the questionnaire"],
  ["Gmail", "Priya: got the confirmation, thanks!"],
  ["Payment", "$105 deposit · Maya Chen"],
  ["Instagram", "@leo.studio started following you"],
  ["Messages", "Priya: running 10 late!!"],
];

export function OneThing() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setInView(true), io.disconnect()), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative max-w-[1200px] mx-auto px-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-10 lg:gap-20 items-center">
        {/* The drowning */}
        <div className="relative h-[360px] lg:h-[440px] overflow-hidden rounded-[26px] border border-paper/10 bg-graphite [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]">
          <ul className={cn("px-5", !inView && "opacity-0", inView && "dt-rise")}>
            {[...ACTIVITY, ...ACTIVITY].map(([src, text], i) => (
              <li key={i} className="flex items-center gap-3 py-3 border-b border-paper/[0.06] text-paper/55">
                <span className="w-1.5 h-1.5 rounded-full bg-paper/25 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-paper/35 w-24 shrink-0">{src}</span>
                <span className="text-sm truncate">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* The one thing */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent mb-5">Out of all of it</p>
          <h2 className="font-sans font-extrabold text-[clamp(3rem,7vw,6.5rem)] leading-[0.9] tracking-[-0.05em] text-paper">
            One thing.
          </h2>
          <div className={cn("mt-8 max-w-md", inView ? "dt-land" : "opacity-0")} style={{ animationDelay: "350ms" }}>
            <div className="group relative flex items-center gap-4 rounded-[22px] border border-accent/50 px-5 py-4 bg-[linear-gradient(135deg,rgba(240,82,77,0.28),rgba(240,82,77,0.08))] shadow-[0_24px_60px_-24px_rgba(240,82,77,0.7)] transition-transform duration-200 hover:-translate-y-0.5">
              <span className="w-11 h-11 rounded-full bg-accent text-white flex items-center justify-center text-sm font-extrabold shrink-0">MC</span>
              <div className="min-w-0 flex-1">
                <div className="text-base sm:text-lg font-extrabold text-paper tracking-tight leading-tight">Reply to Maya. She wants Tuesday.</div>
                <div className="text-sm text-paper/60 mt-1">Waiting 2 hours · returning client · $350</div>
              </div>
              <span className="inline-flex items-center h-10 px-4 rounded-full bg-accent text-white text-sm font-extrabold shrink-0 transition-transform duration-150 group-hover:scale-105">Reply</span>
            </div>
          </div>
          <p className="mt-7 text-paper/50 text-base max-w-sm">It doesn&rsquo;t just collect your business. It tells you what matters, and hands you the button.</p>
          <div className="mt-8 grid grid-cols-3 gap-3 max-w-md">
            {[["Today", "2 sessions"], ["Owed to you", "$1,240"], ["This month", "$4,860"]].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-paper/10 bg-paper/[0.04] px-3.5 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-paper/40">{k}</div>
                <div className="text-lg font-extrabold text-paper tracking-tight tabular-nums mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
