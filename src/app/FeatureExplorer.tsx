"use client";

import { useState } from "react";
import { Users, Calendar as CalendarIcon, Inbox as InboxIcon, CreditCard, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabKey = "clients" | "bookings" | "inbox" | "calendar" | "payments";

const TABS: { key: TabKey; label: string; icon: typeof Users; blurb: string }[] = [
  { key: "clients", label: "Clients", icon: Users, blurb: "Every client, their history, and what they're worth to your business — in one list." },
  { key: "bookings", label: "Bookings", icon: CalendarClock, blurb: "From inquiry to delivered, every project moves through one visible pipeline." },
  { key: "inbox", label: "Inbox", icon: InboxIcon, blurb: "Instagram, email, SMS, and your website — every conversation lands in one place." },
  { key: "calendar", label: "Calendar", icon: CalendarIcon, blurb: "See your whole week at a glance. Nothing gets double-booked." },
  { key: "payments", label: "Payments", icon: CreditCard, blurb: "Deposits, balances, and what's still owed — tracked automatically." },
];

export function FeatureExplorer() {
  const [active, setActive] = useState<TabKey>("clients");
  const activeTab = TABS.find((t) => t.key === active)!;

  return (
    <div className="max-w-4xl mx-auto px-6">
      <div role="tablist" aria-label="Product areas" className="flex flex-wrap items-center justify-center gap-2 mb-8">
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              role="tab"
              id={`feature-tab-${t.key}`}
              aria-selected={isActive}
              aria-controls={`feature-panel-${t.key}`}
              onClick={() => setActive(t.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-4 py-2.5 sm:py-2 text-sm font-medium transition-all duration-200 active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1",
                isActive
                  ? "bg-ink text-paper shadow-sm scale-[1.03]"
                  : "bg-white text-ink/75 border border-border hover:text-ink hover:border-ink/20 hover:scale-[1.03]"
              )}
            >
              <t.icon className="w-3.5 h-3.5" strokeWidth={2} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid md:grid-cols-[1fr_1.2fr] gap-8 items-center" role="tabpanel" id={`feature-panel-${active}`} aria-labelledby={`feature-tab-${active}`}>
        <div key={`${active}-copy`} className="animate-[fadeUp_0.4s_ease-out]">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent-text mb-2">{activeTab.label}</div>
          <p className="font-display text-2xl md:text-[1.75rem] leading-snug text-ink">{activeTab.blurb}</p>
        </div>

        <div key={active} className="animate-[fadeUp_0.4s_ease-out]">
          <FeatureMockup tab={active} />
        </div>
      </div>
    </div>
  );
}

function MockCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-white shadow-popover overflow-hidden">{children}</div>;
}

function Avatar({ initials, tone }: { initials: string; tone: string }) {
  return (
    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0", tone)}>{initials}</div>
  );
}

export function FeatureMockup({ tab }: { tab: TabKey }) {
  if (tab === "clients") {
    return (
      <MockCard>
        <div className="divide-y divide-border">
          {[
            { name: "Sarah Johnson", meta: "$3,200 · 4 bookings", initials: "SJ", tone: "bg-accent-soft text-accent-text" },
            { name: "Mike Chen", meta: "$1,850 · 2 bookings", initials: "MC", tone: "bg-info-soft text-info-text" },
            { name: "Priya Patel", meta: "$4,600 · 6 bookings", initials: "PP", tone: "bg-success-soft text-success-text" },
          ].map((c) => (
            <div key={c.name} className="flex items-center gap-3 px-4 py-3.5">
              <Avatar initials={c.initials} tone={c.tone} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink">{c.name}</div>
                <div className="text-xs text-ink/65">{c.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </MockCard>
    );
  }

  if (tab === "bookings") {
    const stages = ["Inquiry", "Confirmed", "In progress", "Delivered"];
    return (
      <MockCard>
        <div className="p-5">
          <div className="text-sm font-medium text-ink mb-1">Strategy Session — Sarah Johnson</div>
          <div className="text-xs text-ink/65 mb-4">June 14 · $2,400</div>
          <div className="flex items-center">
            {stages.map((s, i) => (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={cn("w-3 h-3 rounded-full shrink-0", i <= 2 ? "bg-accent" : "bg-black/10")} />
                  <span className="text-[10px] text-ink/65 whitespace-nowrap">{s}</span>
                </div>
                {i < stages.length - 1 && <div className={cn("h-px flex-1 mx-1.5 mb-4", i < 2 ? "bg-accent" : "bg-black/10")} />}
              </div>
            ))}
          </div>
        </div>
      </MockCard>
    );
  }

  if (tab === "inbox") {
    return (
      <MockCard>
        <div className="divide-y divide-border">
          {[
            { name: "Sarah Johnson", channel: "Instagram", msg: "Are you available June 14?", tone: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]" },
            { name: "Mike Chen", channel: "Email", msg: "Thanks, that sounds great!", tone: "bg-[#4F46E5]" },
            { name: "Priya Patel", channel: "SMS", msg: "Do you have availability next week?", tone: "bg-[#0D9488]" },
          ].map((m) => (
            <div key={m.name} className="flex items-center gap-3 px-4 py-3.5">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", m.tone)}>
                <span className="text-[10px] font-semibold text-white">{m.name[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-ink">{m.name}</span>
                  <span className="text-[10px] text-ink/35">· {m.channel}</span>
                </div>
                <div className="text-xs text-ink/65 truncate">{m.msg}</div>
              </div>
            </div>
          ))}
        </div>
      </MockCard>
    );
  }

  if (tab === "calendar") {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const booked: Record<string, number[]> = { Tue: [1], Thu: [2, 3] };
    return (
      <MockCard>
        <div className="p-5 grid grid-cols-5 gap-2">
          {days.map((d) => (
            <div key={d} className="flex flex-col gap-1.5">
              <div className="text-[10px] font-medium text-ink/65 text-center mb-1">{d}</div>
              {[0, 1, 2, 3].map((slot) => (
                <div
                  key={slot}
                  className={cn("h-6 rounded-md", booked[d]?.includes(slot) ? "bg-accent/80" : "bg-black/[0.04]")}
                />
              ))}
            </div>
          ))}
        </div>
      </MockCard>
    );
  }

  return (
    <MockCard>
      <div className="divide-y divide-border">
        {[
          { label: "Deposit — Sarah Johnson", amount: "$720", status: "Paid", tone: "success" },
          { label: "Balance — Mike Chen", amount: "$1,850", status: "Awaiting", tone: "warning" },
          { label: "Deposit — Priya Patel", amount: "$1,380", status: "Paid", tone: "success" },
        ].map((p) => (
          <div key={p.label} className="flex items-center justify-between px-4 py-3.5">
            <div>
              <div className="text-sm font-medium text-ink">{p.label}</div>
              <div className="text-xs text-ink/65">{p.amount}</div>
            </div>
            <span
              className={cn(
                "text-[11px] font-medium rounded-full px-2 py-0.5",
                p.tone === "success" ? "bg-success-soft text-success-text" : "bg-warning-soft text-warning-text"
              )}
            >
              {p.status}
            </span>
          </div>
        ))}
      </div>
    </MockCard>
  );
}
