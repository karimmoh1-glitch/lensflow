"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Beat, Arrow } from "./ProductDemo";

/**
 * The part of the business that runs itself — shown running. When the section is in
 * view, the automation fires on a loop: WHEN lights, then IF, then THEN, a message
 * slides out, and a new line lands in the log. A sentence you can read, doing its job.
 */
const LOG_SEED = [
  ["bg-success", "Session reminder", "Sent · Maya Chen · Messages", "yesterday"],
  ["bg-success", "Booking confirmation", "Sent · Priya Patel · email", "3 days ago"],
  ["bg-ink/25", "Thank-you + review", "Skipped · already reviewed", "5 days ago"],
];

export function Workflow() {
  const ref = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState<0 | 1 | 2 | 3 | 4>(0); // 0 idle · 1 when · 2 if · 3 then · 4 sent
  const [fired, setFired] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setBeat(4);
      setFired(1);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let loop: ReturnType<typeof setInterval> | undefined;
    const fire = () => {
      timers.forEach(clearTimeout);
      timers = [];
      const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
      setBeat(1);
      later(() => setBeat(2), 550);
      later(() => setBeat(3), 1100);
      later(() => { setBeat(4); setFired((n) => n + 1); }, 1700);
      later(() => setBeat(0), 4200);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !loop) {
          fire();
          loop = setInterval(fire, 6000);
        } else if (!e.isIntersecting && loop) {
          clearInterval(loop);
          loop = undefined;
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (loop) clearInterval(loop);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div ref={ref} className="max-w-[1200px] mx-auto px-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-10 lg:gap-16 items-center">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text mb-4">Runs itself</p>
          <h2 className="font-sans font-extrabold text-[clamp(2.4rem,4.4vw,3.9rem)] leading-[0.94] tracking-[-0.045em] text-ink">
            Reminders that<br /><span className="whitespace-nowrap">send themselves.</span>
          </h2>
          <p className="mt-5 text-ink/60 text-base max-w-xs">A sentence you can read. No flowcharts.</p>
        </div>

        <div className="rounded-[22px] border border-border bg-white shadow-[0_32px_80px_-32px_rgba(16,17,20,0.3)] overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-sm font-semibold text-ink">Session reminder</span>
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-success-text"><span className={cn("w-1.5 h-1.5 rounded-full bg-success", beat > 0 && beat < 4 && !reduced && "animate-ping")} />On</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
              <div className={cn("rounded-xl transition-shadow duration-300", beat === 1 && "dt-beat", beat >= 1 && "shadow-[0_0_0_2px_rgba(240,82,77,0.35)]")}><Beat label="When" tone="signal" text="a booking is coming up" /></div>
              <Arrow />
              <div className={cn("rounded-xl transition-shadow duration-300", beat === 2 && "dt-beat", beat >= 2 && "shadow-[0_0_0_2px_rgba(109,90,230,0.35)]")}><Beat label="If" tone="thinking" text="1 day before" /></div>
              <Arrow />
              <div className={cn("rounded-xl transition-shadow duration-300", beat === 3 && "dt-beat", beat >= 3 && "shadow-[0_0_0_2px_rgba(30,142,90,0.35)]")}><Beat label="Then" tone="outcome" text="send a reminder" /></div>
            </div>
            <div className={cn("mt-3 flex items-start gap-2 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", beat >= 3 ? "opacity-100 translate-y-0" : "opacity-40 translate-y-1")}>
              <span className="mt-0.5 w-4 h-4 rounded-[5px] bg-[#34C759] shrink-0" />
              <p className="text-xs text-ink/70 leading-relaxed">“Hi Maya — see you tomorrow at 2:00. Reply here if anything changes.”</p>
            </div>
          </div>
          <div className="px-5 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45 mb-1">Recently ran</div>
            <ol className="relative pl-6">
              <span aria-hidden className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
              {fired > 0 && (
                <li key={fired} className="dt-swap relative py-2 flex items-start justify-between gap-3">
                  <span aria-hidden className="absolute -left-6 top-[13px] w-[11px] h-[11px] rounded-full border-2 border-white bg-success" />
                  <div className="min-w-0"><div className="text-sm font-medium text-ink truncate">Session reminder</div><div className="text-xs text-ink/60 truncate">Sent · Maya Chen · Messages</div></div>
                  <div className="text-[11px] font-bold text-success-text shrink-0">just now</div>
                </li>
              )}
              {LOG_SEED.map(([dot, t, m, w]) => (
                <li key={t + w} className="relative py-2 flex items-start justify-between gap-3">
                  <span aria-hidden className={`absolute -left-6 top-[13px] w-[11px] h-[11px] rounded-full border-2 border-white ${dot}`} />
                  <div className="min-w-0"><div className="text-sm font-medium text-ink truncate">{t}</div><div className="text-xs text-ink/60 truncate">{m}</div></div>
                  <div className="text-[11px] text-ink/45 shrink-0">{w}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
