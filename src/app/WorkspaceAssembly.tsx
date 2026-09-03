"use client";

import { Users, CalendarClock, Calendar, Inbox, Mail, MessageCircle, CreditCard, ListChecks, Zap, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollProgress } from "./useScrollProgress";

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}

type Module = { key: string; label: string; icon: LucideIcon | typeof InstagramGlyph; tone: string };

const GROUPS: { eyebrow: string; title: string; body: string; modules: Module[] }[] = [
  {
    eyebrow: "Start here",
    title: "The basics every business needs.",
    body: "Clients, bookings, and a calendar — the foundation, on by default.",
    modules: [
      { key: "clients", label: "Clients", icon: Users, tone: "bg-accent-soft text-accent-text" },
      { key: "bookings", label: "Bookings", icon: CalendarClock, tone: "bg-info-soft text-info-text" },
      { key: "calendar", label: "Calendar", icon: Calendar, tone: "bg-success-soft text-success-text" },
    ],
  },
  {
    eyebrow: "Add how you talk to people",
    title: "Turn on the channels you actually use.",
    body: "Inbox, Gmail, SMS, Instagram — connect only what your business runs on.",
    modules: [
      { key: "inbox", label: "Inbox", icon: Inbox, tone: "bg-signal-soft text-signal-text" },
      { key: "gmail", label: "Gmail", icon: Mail, tone: "bg-danger-soft text-danger-text" },
      { key: "sms", label: "SMS", icon: MessageCircle, tone: "bg-success-soft text-success-text" },
      { key: "instagram", label: "Instagram", icon: InstagramGlyph, tone: "bg-accent-soft text-accent-text" },
    ],
  },
  {
    eyebrow: "Layer in the rest",
    title: "Payments, tasks, and a copilot when you're ready.",
    body: "Nothing here is mandatory. Your workspace only has what you turned on.",
    modules: [
      { key: "payments", label: "Payments", icon: CreditCard, tone: "bg-warning-soft text-warning-text" },
      { key: "tasks", label: "Tasks", icon: ListChecks, tone: "bg-info-soft text-info-text" },
      { key: "automations", label: "Automations", icon: Zap, tone: "bg-signal-soft text-signal-text" },
      { key: "ai", label: "AI Copilot", icon: Sparkles, tone: "bg-signal-soft text-signal-text" },
    ],
  },
];

const ALL_MODULES = GROUPS.flatMap((g) => g.modules);

/**
 * The one deliberately scroll-scrubbed moment on the page: a pinned section where
 * scattered module icons fly into an empty workspace outline as the user scrolls,
 * settling into their grid slots one at a time. Tells "scattered -> organized" through
 * continuous scroll position, not a triggered-once reveal — the rest of the page uses
 * IntersectionObserver reveals; this is the one place that earns something stronger.
 */
export function WorkspaceAssembly() {
  const { ref, progress, reducedMotion } = useScrollProgress<HTMLDivElement>();

  const phaseIndex = Math.min(GROUPS.length - 1, Math.floor(progress * GROUPS.length));
  const phase = GROUPS[reducedMotion ? GROUPS.length - 1 : phaseIndex];

  return (
    <div ref={ref} className="relative" style={reducedMotion ? undefined : { height: "280vh" }}>
      <div className={cn("sticky top-0 flex flex-col items-center justify-center px-6", reducedMotion ? "py-20 md:py-28" : "h-screen overflow-hidden")}>
        <div className="text-center max-w-lg mx-auto mb-8 md:mb-10">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/40 mb-3">Modular by design</div>
          <h2 className="font-sans font-black text-3xl md:text-[2.75rem] leading-[1.02] tracking-tight text-ink mb-3">You choose what you need.</h2>
          <p key={reducedMotion ? "static" : phaseIndex} className={cn("text-sm md:text-base text-ink/55 max-w-sm mx-auto", !reducedMotion && "animate-[fadeUp_0.4s_ease-out]")}>
            {phase.body}
          </p>
        </div>

        <div className="relative w-full max-w-md h-[300px] md:h-[340px] flex items-center justify-center">
          {!reducedMotion &&
            ALL_MODULES.map((m, i) => {
              const threshold = (i + 0.5) / ALL_MODULES.length;
              const docked = progress >= threshold;
              const angle = (i / ALL_MODULES.length) * Math.PI * 2 - Math.PI / 2;
              const radius = i % 2 === 0 ? 148 : 182;
              const scatterX = Math.cos(angle) * radius;
              const scatterY = Math.sin(angle) * radius * 0.62;
              const rotation = ((i * 47) % 30) - 15;
              return (
                <div
                  key={m.key}
                  className="absolute left-1/2 top-1/2 transition-all duration-500 ease-[cubic-bezier(0.34,1.3,0.64,1)] pointer-events-none"
                  style={{
                    transform: docked
                      ? "translate(-50%, -50%) scale(0.35) rotate(0deg)"
                      : `translate(calc(-50% + ${scatterX}px), calc(-50% + ${scatterY}px)) rotate(${rotation}deg)`,
                    opacity: docked ? 0 : 1,
                  }}
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shadow-sm", m.tone)}>
                    <m.icon className="w-[18px] h-[18px]" />
                  </div>
                </div>
              );
            })}

          <div
            className={cn(
              "relative rounded-2xl p-5 w-72 transition-all duration-500",
              reducedMotion || progress > 0.04 ? "border border-border bg-white shadow-popover" : "border-2 border-dashed border-ink/15 bg-transparent"
            )}
          >
            <div className="flex items-center gap-1.5 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">Your workspace</span>
            </div>
            <div className="grid grid-cols-3 gap-2 min-h-[168px] content-start">
              {ALL_MODULES.map((m, i) => {
                const threshold = (i + 0.5) / ALL_MODULES.length;
                const docked = reducedMotion || progress >= threshold;
                return (
                  <div
                    key={m.key}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border border-border py-3 transition-all duration-400",
                      docked ? "opacity-100 scale-100" : "opacity-0 scale-50"
                    )}
                  >
                    <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", m.tone)}>
                      <m.icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] font-medium text-ink/55 text-center leading-tight">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {!reducedMotion && (
          <div className="w-40 h-1 rounded-full bg-black/[0.06] mt-8 overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-150" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
