"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plug, Building2, UserRound, Bell, ShieldCheck, CreditCard, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsTab = "channels" | "business" | "profile" | "notifications" | "security" | "subscription" | "team";
const TABS: Array<{ key: SettingsTab; label: string; blurb: string; icon: typeof Plug }> = [
  { key: "channels", label: "Integrations", blurb: "Email, texts, calendars, payments, files", icon: Plug },
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
    <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12 lg:items-start">
      {/* Desktop: the sections, always in view. */}
      <nav aria-label="Settings sections" className="hidden lg:block lg:sticky lg:top-6">
        <ul className="space-y-0.5">
          {TABS.map((t) => {
            const on = active === t.key;
            return (
              <li key={t.key}>
                <Link
                  href={hrefFor(t.key)}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded px-2 h-8 text-13 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70",
                    on ? "bg-ink/[0.07] text-ink" : "text-ink/70 hover:text-ink hover:bg-ink/[0.04]"
                  )}
                >
                  <t.icon className={cn("w-4 h-4 shrink-0", on ? "text-ink" : "text-ink/55")} strokeWidth={1.75} aria-hidden />
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
          <ul className="lg:hidden divide-y divide-border rounded-lg border border-border bg-white overflow-hidden" aria-label="Settings sections">
            {TABS.map((t) => (
              <li key={t.key}>
                <Link href={`${hrefFor(t.key)}${t.key === "channels" ? "?tab=channels" : ""}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper focus-visible:outline-none focus-visible:bg-paper">
                  <t.icon className="w-5 h-5 text-ink/55 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{t.label}</span>
                    <span className="block text-xs text-ink/65 truncate">{t.blurb}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-ink/60 shrink-0" strokeWidth={1.75} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden lg:block dt-swap" key={active}>{panels[active]}</div>
        </>
      ) : (
        <div className="dt-swap" key={active}>
          <Link href="/dashboard/settings" className="lg:hidden inline-flex items-center gap-1 min-h-[32px] text-xs font-medium text-ink/70 hover:text-ink mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 rounded">
            <ChevronLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden />All settings
          </Link>
          <h2 className="lg:hidden text-page-title font-semibold text-ink mb-4">{current.label}</h2>
          {panels[active]}
        </div>
      )}
    </div>
  );
}
