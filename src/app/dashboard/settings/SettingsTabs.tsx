"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plug, Building2, UserRound, Bell, ShieldCheck, CreditCard, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsTab = "channels" | "business" | "profile" | "notifications" | "security" | "subscription" | "team";
const TABS: Array<{ key: SettingsTab; label: string; blurb: string; icon: typeof Plug }> = [
  { key: "channels", label: "Channels", blurb: "Gmail, Instagram, WhatsApp, SMS, calendars", icon: Plug },
  { key: "business", label: "Business", blurb: "Name, services, hours, timezone", icon: Building2 },
  { key: "profile", label: "Profile", blurb: "Your name and email", icon: UserRound },
  { key: "notifications", label: "Notifications", blurb: "What Daythread tells you about", icon: Bell },
  { key: "security", label: "Security", blurb: "Password and sessions", icon: ShieldCheck },
  { key: "subscription", label: "Subscription", blurb: "Your Daythread plan", icon: CreditCard },
  { key: "team", label: "Team", blurb: "People on this inbox", icon: Users },
];
const hrefFor = (key: SettingsTab) => (key === "channels" ? "/dashboard/settings" : `/dashboard/settings?tab=${key}`);

/**
 * Settings is a control center, not a page you scroll to discover. On desktop every section
 * is a link in a sidebar beside the open panel, visible at once. On a phone, Settings opens
 * as a list of sections; picking one shows that panel with a way back. URL-driven either
 * way, so the back button, a provider callback and a shared link all land on the right panel.
 */
export function SettingsTabs({ active, explicit, panels }: { active: SettingsTab; explicit: boolean; panels: Record<SettingsTab, ReactNode> }) {
  const current = TABS.find((t) => t.key === active)!;
  return (
    <div className="md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-8 lg:gap-12 md:items-start">
      {/* Desktop: the sections, always in view. */}
      <nav aria-label="Settings sections" className="hidden md:block md:sticky md:top-6">
        <ul className="space-y-0.5">
          {TABS.map((t) => {
            const on = active === t.key;
            return (
              <li key={t.key}>
                <Link
                  href={hrefFor(t.key)}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                    on ? "bg-ink text-white" : "text-ink/70 hover:text-ink hover:bg-black/[0.04]"
                  )}
                >
                  <t.icon className={cn("w-4 h-4 shrink-0", on ? "text-white" : "text-ink/65")} strokeWidth={2} aria-hidden />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Phone: an index of sections, then the chosen one with a way back. */}
      {!explicit ? (
        <>
          <ul className="md:hidden divide-y divide-border rounded-[20px] border border-border bg-white overflow-hidden" aria-label="Settings sections">
            {TABS.map((t) => (
              <li key={t.key}>
                <Link href={`${hrefFor(t.key)}${t.key === "channels" ? "?tab=channels" : ""}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-black/[0.02] active:bg-black/[0.04] focus-visible:outline-none focus-visible:bg-black/[0.04]">
                  <span className="w-9 h-9 rounded-xl bg-paper text-ink/70 flex items-center justify-center shrink-0"><t.icon className="w-4 h-4" strokeWidth={2} aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{t.label}</span>
                    <span className="block text-xs text-ink/65 truncate">{t.blurb}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-ink/40 shrink-0" strokeWidth={2} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden md:block dt-swap" key={active}>{panels[active]}</div>
        </>
      ) : (
        <div className="dt-swap" key={active}>
          <Link href="/dashboard/settings" className="md:hidden inline-flex items-center gap-1 text-xs font-semibold text-ink/70 hover:text-ink mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded">
            <ChevronLeft className="w-4 h-4" strokeWidth={2} aria-hidden />All settings
          </Link>
          <h2 className="md:hidden font-sans font-extrabold text-xl tracking-tight text-ink mb-4">{current.label}</h2>
          {panels[active]}
        </div>
      )}
    </div>
  );
}
