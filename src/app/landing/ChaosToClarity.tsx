"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The defining scroll moment. Seven scraps of one business — an Instagram DM, a Gmail
 * thread, a text, a Messenger ping, a calendar hold, a Venmo payment, a note-to-self —
 * scattered across the screen. As the visitor scrolls, they pull into a single dark
 * thread, in order, each one now knowing what it is. Then the one thing left to do.
 *
 * Desktop: a pinned section driven by scroll position (transform + opacity only, rAF
 * throttled). Below lg: the same cards, driven once by intersection so nothing pins on a
 * phone. Reduced motion: the finished thread.
 */
type Scrap = { key: string; source: string; color: string; text: string; from: { x: number; y: number; r: number }; label: string; node: string };

const SCRAPS: Scrap[] = [
  { key: "ig", source: "Instagram", color: "#D62976", text: "Hey! Are you free Tuesday?", from: { x: -300, y: -160, r: -8 }, label: "Maya asked about Tuesday", node: "bg-accent" },
  { key: "gmail", source: "Gmail", color: "#EA4335", text: "Re: invoice for last month?", from: { x: 260, y: -220, r: 6 }, label: "Jordan asked about the invoice", node: "bg-accent" },
  { key: "sms", source: "SMS", color: "#2FC26E", text: "running 10 late!!", from: { x: -340, y: 40, r: 4 }, label: "“Running 10 late” — attached to Priya’s 3pm", node: "bg-ink/70" },
  { key: "msgr", source: "Messenger", color: "#8134F5", text: "Can we do the full package?", from: { x: 320, y: -20, r: -5 }, label: "Priya wants the full package · $1,800", node: "bg-signal" },
  { key: "cal", source: "Calendar", color: "#6B7280", text: "Tue 2pm — Maya?", from: { x: -240, y: 220, r: 7 }, label: "Booked · Maya · Tue 2:00 PM", node: "bg-ink/70" },
  { key: "venmo", source: "Venmo", color: "#B0740B", text: "$105 from Maya C.", from: { x: 300, y: 200, r: -7 }, label: "$105 deposit · matched to Maya’s booking", node: "bg-success" },
  { key: "note", source: "Notes", color: "#6B7280", text: "follow up w/ Jordan!!", from: { x: 40, y: 290, r: 9 }, label: "Follow up with Jordan · due today", node: "bg-accent" },
];

const STAGE_H = 600;
const PANEL_H = 7 * 60 + 130;
const SCRAP_W = 230;

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function ChaosToClarity() {
  const sectionRef = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setP(1);
      return;
    }
    const lg = window.matchMedia("(min-width: 1024px)");
    const el = sectionRef.current;
    if (!el) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const range = r.height - window.innerHeight;
        setP(clamp(-r.top / Math.max(range, 1)));
        ticking = false;
      });
    };

    let io: IntersectionObserver | undefined;
    const apply = () => {
      window.removeEventListener("scroll", onScroll);
      io?.disconnect();
      if (lg.matches) {
        setPinned(true);
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
      } else {
        setPinned(false);
        io = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting) {
              setP(1);
              io?.disconnect();
            }
          },
          { threshold: 0.35 }
        );
        setP(0);
        io.observe(el);
      }
    };
    apply();
    lg.addEventListener("change", apply);
    return () => {
      lg.removeEventListener("change", apply);
      window.removeEventListener("scroll", onScroll);
      io?.disconnect();
    };
  }, []);

  // Two phases: 0–0.55 the scraps gather; 0.55–1 the thread reads itself and the action appears.
  const gather = ease(clamp(p / 0.55));
  const panel = ease(clamp((p - 0.22) / 0.3));
  const read = ease(clamp((p - 0.5) / 0.45));

  return (
    <section ref={sectionRef} className={cn("relative bg-paper", pinned ? "h-[240vh]" : "py-20")} aria-label="Your business, scattered, then on one thread">
      <div className={cn("w-full", pinned && "sticky top-0 h-screen flex items-center overflow-hidden")}>
        <div className="max-w-6xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-10 lg:gap-16 items-center">
          {/* Copy: two states, crossfading */}
          <div className="relative min-h-[180px] lg:min-h-[260px]">
            <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: 1 - read }}>
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink/45 mb-4">Right now</p>
              <h2 className="font-sans font-extrabold text-[clamp(2.2rem,4.6vw,3.75rem)] leading-[0.96] tracking-[-0.04em] text-ink">
                Ten apps.<br />Zero picture.
              </h2>
            </div>
            <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: read }}>
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-signal-text mb-4">On Daythread</p>
              <h2 className="font-sans font-extrabold text-[clamp(2.2rem,4.6vw,3.75rem)] leading-[0.96] tracking-[-0.04em] text-ink">
                One thread.<br />Whole picture.
              </h2>
            </div>
          </div>

          {/* Stage */}
          <div className="relative h-[600px]">
            {/* The dark thread panel fades in under the gathering scraps */}
            <div
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-[24px] bg-midnight transition-opacity duration-500"
              style={{ opacity: panel, height: PANEL_H }}
            >
              <span aria-hidden className="absolute left-[27px] top-6 bottom-[104px] w-px bg-paper/15" />
              <span
                aria-hidden
                className="absolute left-[27px] top-6 w-px bg-gradient-to-b from-accent via-signal to-success origin-top"
                style={{ height: `calc(100% - 128px)`, transform: `scaleY(${read})` }}
              />
              <div
                className="absolute left-4 right-4 bottom-4 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 transition-all duration-500"
                style={{ opacity: read > 0.85 ? 1 : 0, transform: `translateY(${read > 0.85 ? 0 : 8}px)` }}
              >
                <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-paper">Reply to Jordan about the invoice</div>
                  <div className="text-xs text-paper/60">Everyone else is booked, paid, or handled. This is the one thing.</div>
                </div>
                <span className="text-xs font-bold text-accent shrink-0">Reply →</span>
              </div>
            </div>

            {SCRAPS.map((s, i) => {
              const panelTop = STAGE_H / 2 - PANEL_H / 2;
              const targetY = panelTop + 20 + i * 60;
              const startX = 200 + s.from.x;
              const startY = 280 + s.from.y;
              const x = startX + (16 - startX) * gather;
              const y = startY + (targetY - startY) * gather;
              const r = s.from.r * (1 - gather);
              return (
                <div
                  key={s.key}
                  className="absolute left-0 top-0 will-change-transform"
                  style={{ transform: `translate3d(${x}px, ${y}px, 0) rotate(${r}deg)`, width: `calc(${SCRAP_W}px + (100% - 32px - ${SCRAP_W}px) * ${read})` }}
                >
                  {/* scrap face */}
                  <div
                    className="absolute inset-0 rounded-xl border bg-white shadow-popover px-3 py-2 transition-opacity duration-300"
                    style={{ opacity: 1 - read, borderColor: `${s.color}55` }}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: s.color }}>{s.source}</div>
                    <div className="text-xs text-ink truncate">{s.text}</div>
                  </div>
                  {/* thread face */}
                  <div className="relative flex items-center gap-3 pl-3 pr-3 h-[46px] transition-opacity duration-300" style={{ opacity: read }}>
                    <span className={cn("w-[15px] h-[15px] rounded-full border-[3px] border-midnight shrink-0", s.node)} />
                    <span className="text-sm font-medium text-paper truncate">{s.label}</span>
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-paper/40 shrink-0">{s.source}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
