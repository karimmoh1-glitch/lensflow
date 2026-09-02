import { Users, CalendarClock, Calendar, Inbox, CreditCard, Zap, Mail, MessageCircle, Sparkles, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const MODULES = [
  { label: "Clients", icon: Users, tone: "bg-accent-soft text-accent-text" },
  { label: "Bookings", icon: CalendarClock, tone: "bg-info-soft text-info-text" },
  { label: "Calendar", icon: Calendar, tone: "bg-success-soft text-success-text" },
  { label: "Inbox", icon: Inbox, tone: "bg-warning-soft text-warning-text" },
  { label: "Payments", icon: CreditCard, tone: "bg-accent-soft text-accent-text" },
  { label: "Automations", icon: Zap, tone: "bg-info-soft text-info-text" },
  { label: "Gmail", icon: Mail, tone: "bg-danger-soft text-danger-text" },
  { label: "SMS", icon: MessageCircle, tone: "bg-success-soft text-success-text" },
  { label: "Tasks", icon: ListChecks, tone: "bg-warning-soft text-warning-text" },
  { label: "AI Copilot", icon: Sparkles, tone: "bg-accent-soft text-accent-text" },
];

export function ModulesGrid() {
  return (
    <div className="max-w-4xl mx-auto px-6">
      <div className="text-center max-w-lg mx-auto mb-10">
        <h2 className="font-display text-2xl md:text-3xl text-ink">You choose what you need.</h2>
        <p className="mt-2 text-sm text-ink/55">
          Daythread is modular — turn on the pieces that fit how you actually run your business, and ignore the rest.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {MODULES.map((m) => (
          <div
            key={m.label}
            className="group flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-white px-4 py-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-popover hover:border-transparent"
          >
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110", m.tone)}>
              <m.icon className="w-[18px] h-[18px]" strokeWidth={2} />
            </div>
            <span className="text-xs font-medium text-ink/70">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
