"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The defining scroll moment, in four beats:
 *
 *   tension       seven scraps of one business, scattered and drifting
 *   movement      they pull toward the center as the visitor scrolls
 *   convergence   they settle into a column on a dark sheet and become a single thread —
 *                 each one now knowing whose it is and what it means
 *   resolution    the thread reads itself, and the one thing left to do lands
 *
 * Desktop: pinned, driven by scroll position (transform + opacity only, rAF throttled).
 * Below lg: nothing pins; when the section comes into view the same sequence plays on a
 * timer, so phones get the film, not a still. Reduced motion: the resolved state.
 */
type Scrap = { key: string; source: string; color: string; text: string; from: { x: number; y: number; r: number }; label: string; node: string };

const SCRAPS: Scrap[] = [
  { key: "ig", source: "Instagram", color: "#D62976", text: "Hey! Are you free Tuesday?", from: { x: -300, y: -170, r: -8 }, label: "Maya asked about Tuesday", node: "bg-accent" },
  { key: "gmail", source: "Gmail", color: "#EA4335", text: "Re: invoice for last month?", from: { x: 250, y: -230, r: 6 }, label: "Jordan asked about the invoice", node: "bg-accent" },
  { key: "sms", source: "Messages", color: "#34C759", text: "running 10 late!!", from: { x: -340, y: 30, r: 4 }, label: "“Running 10 late” — attached to Priya’s 3pm", node: "bg-ink/70" },
  { key: "wa", source: "WhatsApp", color: "#25D366", text: "Can we do the full package?", from: { x: 320, y: -30, r: -5 }, label: "Sam wants the full package · $1,800", node: "bg-signal" },
  { key: "cal", source: "Calendar", color: "#6B7280", text: "Tue 2pm — Maya?", from: { x: -240, y: 220, r: 7 }, label: "Booked · Maya · Tue 2:00 PM", node: "bg-ink/70" },
  { key: "pay", source: "Payment", color: "#B0740B", text: "$105 from Maya C.", from: { x: 300, y: 200, r: -7 }, label: "$105 deposit · matched to Maya’s booking", node: "bg-success" },
  { key: "task", source: "Task", color: "#6B7280", text: "follow up w/ Jordan!!", from: { x: 40, y: 290, r: 9 }, label: "Follow up with Jordan · due today", node: "bg-accent" },
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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
    let raf = 0;
    const playTimed = () => {
      const start = performance.now();
      const dur = 2600;
      const step = (now: number) => {
        const t = clamp((now - start) / dur);
        setP(t);
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const apply = () => {
      window.removeEventListener("scroll", onScroll);
      io?.disconnect();
      cancelAnimationFrame(raf);
      if (lg.matches) {
        setPinned(true);
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
      } else {
        setPinned(false);
        setP(0);
        io = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting) {
              playTimed();
              io?.disconnect();
            }
          },
          { threshold: 0.45 }
        );
        io.observe(el);
      }
    };
    apply();
    lg.addEventListener("change", apply);
    return () => {
      lg.removeEventListener("change", apply);
      window.removeEventListener("scroll", onScroll);
      io?.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const gather = ease(clamp(p / 0.5));
  const panel = ease(clamp((p - 0.2) / 0.28));
  const read = ease(clamp((p - 0.48) / 0.32));
  const resolve = ease(clamp((p - 0.82) / 0.18));
  const stage = p < 0.45 ? 0 : p < 0.85 ? 1 : 2;

  return (
    <section ref={sectionRef} className={cn("relative bg-paper", pinned ? "h-[260vh]" : "py-16")} aria-label="Your business, scattered, then on one thread">
      <div className={cn("w-full", pinned && "sticky top-0 h-screen flex items-center overflow-hidden")}>
        <div className="max-w-[1200px] mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-8 lg:gap-16 items-center">
          {/* Copy: three states */}
          <div className="relative min-h-[170px] lg:min-h-[260px]">
            {[
              { eyebrow: "Right now", color: "text-ink/45", title: <>Ten apps.<br />Zero picture.</> },
              { eyebrow: "On Daythread", color: "text-signal-text", title: <>One thread.<br />Whole picture.</> },
              { eyebrow: "So today", color: "text-accent-text", title: <>One thing<br />to do.</> },
            ].map((s, i) => (
              <div key={i} className="absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ opacity: stage === i ? 1 : 0, transform: `translateY(${stage === i ? 0 : stage > i ? -10 : 10}px)` }}>
                <p className={cn("text-[11px] font-bold uppercase tracking-[0.16em] mb-4", s.color)}>{s.eyebrow}</p>
                <h2 className="font-sans font-extrabold text-[clamp(2.4rem,5vw,4.25rem)] leading-[0.94] tracking-[-0.045em] text-ink">{s.title}</h2>
              </div>
            ))}
          </div>

          {/* Stage */}
          <div className="relative" style={{ height: STAGE_H }}>
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-[26px] bg-midnight shadow-[0_40px_100px_-40px_rgba(16,17,20,0.6)]" style={{ opacity: panel, height: PANEL_H }}>
              <span aria-hidden className="absolute left-[27px] top-6 bottom-[104px] w-px bg-paper/15" />
              <span aria-hidden className="absolute left-[27px] top-6 w-px bg-gradient-to-b from-accent via-signal to-success origin-top" style={{ height: `calc(100% - 128px)`, transform: `scaleY(${read})` }} />
              <div
                className="absolute left-4 right-4 bottom-4 flex items-center gap-3 rounded-2xl border border-accent/50 px-4 py-3.5"
                style={{
                  opacity: resolve,
                  transform: `translateY(${(1 - resolve) * 14}px) scale(${0.96 + resolve * 0.04})`,
                  background: "linear-gradient(135deg, rgba(240,82,77,0.22), rgba(240,82,77,0.06))",
                  boxShadow: `0 0 0 ${resolve * 6}px rgba(240,82,77,${0.18 * (1 - resolve)}), 0 18px 40px -20px rgba(240,82,77,0.6)`,
                }}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-extrabold text-paper tracking-tight">Reply to Jordan about the invoice</div>
                  <div className="text-xs text-paper/60">Everyone else is booked, paid, or handled.</div>
                </div>
                <span className="text-xs font-bold text-accent shrink-0">Reply →</span>
              </div>
            </div>

            {SCRAPS.map((s, i) => {
              const panelTop = STAGE_H / 2 - PANEL_H / 2;
              const targetY = panelTop + 20 + i * 60;
              const startX = 220 + s.from.x;
              const startY = 280 + s.from.y;
              const x = startX + (16 - startX) * gather;
              const y = startY + (targetY - startY) * gather;
              const r = s.from.r * (1 - gather);
              return (
                <div
                  key={s.key}
                  className={cn("absolute left-0 top-0 will-change-transform", p < 0.05 && "dt-drift")}
                  style={{ transform: `translate3d(${x}px, ${y}px, 0) rotate(${r}deg)`, width: `calc(${SCRAP_W}px + (100% - 32px - ${SCRAP_W}px) * ${read})`, animationDelay: `${i * 0.4}s` }}
                >
                  <div className="absolute inset-0 rounded-xl border bg-white shadow-popover px-3 py-2 transition-opacity duration-300" style={{ opacity: 1 - clamp(read * 2.2), borderColor: `${s.color}66` }}>
                    <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: s.color }}>{s.source}</div>
                    <div className="text-xs text-ink truncate">{s.text}</div>
                  </div>
                  <div className="relative flex items-center gap-3 pl-3 pr-3 h-[46px] transition-opacity duration-300" style={{ opacity: clamp((read - 0.45) * 2.2) }}>
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
