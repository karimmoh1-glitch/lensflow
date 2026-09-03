"use client";

import { Users, CalendarClock, Calendar, Inbox, Mail, MessageCircle, CreditCard, ListChecks, Zap, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveStep, StoryStep, StoryLayout } from "./ScrollStory";

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

export function WorkspaceAssembly() {
  const { active, refs } = useActiveStep(GROUPS.length);
  const visibleModules = GROUPS.slice(0, active + 1).flatMap((g) => g.modules);

  return (
    <div>
      <div className="text-center max-w-lg mx-auto mb-4 px-6">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/40 mb-3">Modular by design</div>
        <h2 className="font-sans font-black text-3xl md:text-[2.75rem] leading-[1.02] tracking-tight text-ink">You choose what you need.</h2>
      </div>
      <StoryLayout visual={<WorkspaceCard modules={visibleModules} />}>
        {GROUPS.map((g, i) => (
          <StoryStep key={g.eyebrow} index={i} refs={refs} eyebrow={g.eyebrow} title={g.title} body={g.body} />
        ))}
      </StoryLayout>
    </div>
  );
}

function WorkspaceCard({ modules }: { modules: Module[] }) {
  return (
    <div className="w-72 md:w-80 rounded-2xl border border-border bg-white shadow-popover p-5">
      <div className="flex items-center gap-1.5 mb-4">
        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">Your workspace</span>
      </div>
      <div className="grid grid-cols-3 gap-2 min-h-[200px] content-start">
        {modules.map((m, i) => (
          <div
            key={m.key}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border py-3 animate-[fadeUp_0.4s_ease-out_backwards]"
            style={{ animationDelay: `${(i % 4) * 60}ms` }}
          >
            <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", m.tone)}>
              <m.icon className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-medium text-ink/55 text-center leading-tight">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
