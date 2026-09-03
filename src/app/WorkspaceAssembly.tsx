"use client";

import { useState } from "react";
import { Check, Users, CalendarClock, Calendar, Inbox, Mail, MessageCircle, CreditCard, ListChecks, Zap, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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

const MODULES: Module[] = [
  { key: "clients", label: "Clients", icon: Users, tone: "bg-accent-soft text-accent-text" },
  { key: "bookings", label: "Bookings", icon: CalendarClock, tone: "bg-info-soft text-info-text" },
  { key: "calendar", label: "Calendar", icon: Calendar, tone: "bg-success-soft text-success-text" },
  { key: "inbox", label: "Inbox", icon: Inbox, tone: "bg-signal-soft text-signal-text" },
  { key: "gmail", label: "Gmail", icon: Mail, tone: "bg-danger-soft text-danger-text" },
  { key: "sms", label: "SMS", icon: MessageCircle, tone: "bg-success-soft text-success-text" },
  { key: "instagram", label: "Instagram", icon: InstagramGlyph, tone: "bg-accent-soft text-accent-text" },
  { key: "payments", label: "Payments", icon: CreditCard, tone: "bg-warning-soft text-warning-text" },
  { key: "tasks", label: "Tasks", icon: ListChecks, tone: "bg-info-soft text-info-text" },
  { key: "automations", label: "Automations", icon: Zap, tone: "bg-signal-soft text-signal-text" },
  { key: "ai", label: "AI Copilot", icon: Sparkles, tone: "bg-signal-soft text-signal-text" },
];

const DEFAULT_SELECTED = new Set(["clients", "bookings", "calendar"]);

/**
 * A real product interaction, not a passive animation: click any module to turn it on or
 * off and watch it appear in (or drop out of) the workspace preview immediately. This is
 * the actual "you choose what you need" story — the visitor does the choosing.
 */
export function WorkspaceAssembly() {
  const [selected, setSelected] = useState<Set<string>>(DEFAULT_SELECTED);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const activeModules = MODULES.filter((m) => selected.has(m.key));

  return (
    <div className="max-w-5xl mx-auto px-6">
      <div className="text-center max-w-lg mx-auto mb-10">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/40 mb-3">Modular by design</div>
        <h2 className="font-sans font-black text-3xl md:text-[2.75rem] leading-[1.02] tracking-tight text-ink mb-3">You choose what you need.</h2>
        <p className="text-sm md:text-base text-ink/55 max-w-sm mx-auto">
          Click what your business actually uses. Everything else stays out of your way.
        </p>
      </div>

      <div className="grid md:grid-cols-[1.3fr_1fr] gap-8 md:gap-10 items-start">
        {/* The picker — every module is a real button with a strong on/off state */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {MODULES.map((m) => {
            const isOn = selected.has(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggle(m.key)}
                aria-pressed={isOn}
                className={cn(
                  "relative flex flex-col items-center gap-2 rounded-2xl border py-4 px-2 transition-all duration-200 ease-[cubic-bezier(0.34,1.3,0.64,1)]",
                  "hover:-translate-y-0.5 active:scale-95 active:translate-y-0",
                  isOn ? "border-ink bg-ink shadow-[0_4px_16px_-4px_rgba(16,17,20,0.35)] scale-[1.02]" : "border-border bg-white hover:border-ink/25"
                )}
              >
                {isOn && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent flex items-center justify-center shadow-sm">
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  </span>
                )}
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center transition-colors", isOn ? "bg-white/15" : m.tone)}>
                  <m.icon className={cn("w-4 h-4", isOn && "text-white")} />
                </div>
                <span className={cn("text-[11px] font-medium text-center leading-tight", isOn ? "text-white" : "text-ink/70")}>{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* The workspace preview — populates live from the selection */}
        <div className="md:sticky md:top-24">
          <div className="rounded-2xl border border-border bg-white shadow-popover p-5">
            <div className="flex items-center gap-1.5 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">Your workspace</span>
              <span className="ml-auto text-[11px] text-ink/40">{activeModules.length} on</span>
            </div>
            {activeModules.length === 0 ? (
              <div className="flex items-center justify-center min-h-[140px] text-xs text-ink/35 text-center px-4">
                Nothing turned on yet — click a module to add it.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 min-h-[140px] content-start">
                {activeModules.map((m) => (
                  <div
                    key={m.key}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border py-3 animate-[fadeUp_0.35s_cubic-bezier(0.34,1.3,0.64,1)_backwards]"
                  >
                    <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", m.tone)}>
                      <m.icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] font-medium text-ink/55 text-center leading-tight">{m.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
