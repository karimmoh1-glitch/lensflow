"use client";

import { useState } from "react";
import { Check, Users, CalendarClock, Calendar, Inbox, Mail, MessageCircle, CreditCard, ListChecks, Zap, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeatureMockup, type TabKey } from "./FeatureExplorer";

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}

type Module = { key: string; label: string; icon: LucideIcon | typeof InstagramGlyph; tone: string; preview?: TabKey };

const MODULES: Module[] = [
  { key: "clients", label: "Clients", icon: Users, tone: "bg-accent-soft text-accent-text", preview: "clients" },
  { key: "bookings", label: "Bookings", icon: CalendarClock, tone: "bg-info-soft text-info-text", preview: "bookings" },
  { key: "calendar", label: "Calendar", icon: Calendar, tone: "bg-success-soft text-success-text", preview: "calendar" },
  { key: "inbox", label: "Inbox", icon: Inbox, tone: "bg-signal-soft text-signal-text", preview: "inbox" },
  { key: "gmail", label: "Gmail", icon: Mail, tone: "bg-danger-soft text-danger-text" },
  { key: "sms", label: "SMS", icon: MessageCircle, tone: "bg-success-soft text-success-text" },
  { key: "instagram", label: "Instagram", icon: InstagramGlyph, tone: "bg-accent-soft text-accent-text" },
  { key: "payments", label: "Payments", icon: CreditCard, tone: "bg-warning-soft text-warning-text", preview: "payments" },
  { key: "tasks", label: "Tasks", icon: ListChecks, tone: "bg-info-soft text-info-text" },
  { key: "automations", label: "Automations", icon: Zap, tone: "bg-signal-soft text-signal-text" },
  { key: "ai", label: "AI Copilot", icon: Sparkles, tone: "bg-signal-soft text-signal-text" },
];

const DEFAULT_SELECTED = new Set(["clients", "bookings", "calendar"]);

/**
 * A real product interaction, not a passive animation: click any module to turn it on or
 * off. The preview isn't a checklist of icon badges — it's a compact app shell whose
 * sidebar visibly grows or shrinks with your selection, and whose main pane shows the
 * actual product mockup for whichever module you last turned on (reusing the same
 * mockups from "The product is the pitch" below, so the payoff feels like real software,
 * not a second, disconnected illustration).
 */
export function WorkspaceAssembly() {
  const [selected, setSelected] = useState<Set<string>>(DEFAULT_SELECTED);
  const [previewing, setPreviewing] = useState<TabKey>("clients");

  function toggle(m: Module) {
    setSelected((prev) => {
      const next = new Set(prev);
      const turningOn = !next.has(m.key);
      if (turningOn) next.add(m.key);
      else next.delete(m.key);
      if (turningOn && m.preview) setPreviewing(m.preview);
      return next;
    });
  }

  const activeModules = MODULES.filter((m) => selected.has(m.key));
  const previewableActive = activeModules.filter((m) => m.preview);
  const showingPreview = previewableActive.some((m) => m.preview === previewing);

  return (
    <div className="relative max-w-5xl mx-auto px-6">
      <div className="relative max-w-2xl mb-10">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink/45 mb-4">Modules</p>
        <h2 className="font-sans font-extrabold text-[clamp(2.2rem,5vw,4rem)] leading-[0.96] tracking-[-0.04em] text-ink">Only what you use.</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-8 md:gap-10 items-start">
        {/* The picker — every module is a real button with a strong on/off state */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {MODULES.map((m) => {
            const isOn = selected.has(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggle(m)}
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

        {/* The workspace preview — a real app shell. The sidebar grows with your selection;
            the main pane shows live product UI for whatever you last turned on. */}
        <div className="md:sticky md:top-24">
          <div className="rounded-2xl border border-border bg-white shadow-popover overflow-hidden h-[380px] flex">
            <div className="w-28 sm:w-32 shrink-0 border-r border-border bg-paper/60 flex flex-col">
              <div className="px-3 py-3 border-b border-border">
                <span className="font-display text-xs text-ink">Daythread</span>
              </div>
              <div className="flex-1 overflow-y-auto py-2 flex flex-col gap-0.5 px-1.5">
                {activeModules.length === 0 && <div className="px-2 py-3 text-[10px] text-ink/35 text-center">No modules yet</div>}
                {activeModules.map((m) => {
                  const isPreviewing = m.preview && m.preview === previewing;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      disabled={!m.preview}
                      onClick={() => m.preview && setPreviewing(m.preview)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-all duration-200 animate-[fadeUp_0.3s_cubic-bezier(0.34,1.3,0.64,1)_backwards]",
                        isPreviewing ? "bg-ink text-white" : m.preview ? "text-ink/60 hover:bg-black/[0.04]" : "text-ink/60 cursor-default"
                      )}
                    >
                      <m.icon className="w-3 h-3 shrink-0" />
                      <span className="text-[10px] font-medium truncate">{m.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="px-3 py-2 border-t border-border text-[9px] text-ink/35">{activeModules.length} on</div>
            </div>

            <div className="flex-1 min-w-0 p-4 flex flex-col">
              {previewableActive.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-center px-4">
                  <p className="text-xs text-ink/35">Turn on Clients, Bookings, Inbox, Calendar, or Payments to see it here.</p>
                </div>
              ) : showingPreview ? (
                <div key={previewing} className="animate-[fadeUp_0.35s_ease-out]">
                  <FeatureMockup tab={previewing} />
                </div>
              ) : (
                <div key={previewableActive[0].preview} className="animate-[fadeUp_0.35s_ease-out]">
                  <FeatureMockup tab={previewableActive[0].preview as TabKey} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
