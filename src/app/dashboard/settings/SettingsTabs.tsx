"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SettingsTab = "channels" | "business" | "profile" | "notifications" | "security" | "subscription" | "team";
const TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: "channels", label: "Channels" },
  { key: "business", label: "Business" },
  { key: "profile", label: "Profile" },
  { key: "notifications", label: "Notifications" },
  { key: "security", label: "Security" },
  { key: "subscription", label: "Subscription" },
  { key: "team", label: "Team" },
];

/** URL-driven tabs: each is a real link, so the browser's back button, a provider callback
 * and a shared link all land on the right panel. */
export function SettingsTabs({ active, panels }: { active: SettingsTab; panels: Record<SettingsTab, ReactNode> }) {
  return (
    <div>
      <div role="tablist" aria-label="Settings sections" className="flex items-center gap-1 mb-6 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-1 rounded-full bg-black/[0.04] p-1 w-max">
          {TABS.map((t) => (
            <Link
              key={t.key}
              role="tab"
              aria-selected={active === t.key}
              href={t.key === "channels" ? "/dashboard/settings" : `/dashboard/settings?tab=${t.key}`}
              className={cn(
                "inline-flex items-center h-8 px-3.5 rounded-full text-[13px] font-semibold transition-colors shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                active === t.key ? "bg-white text-ink shadow-xs" : "text-ink/55 hover:text-ink"
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      <div role="tabpanel" className="dt-swap" key={active}>{panels[active]}</div>
    </div>
  );
}
