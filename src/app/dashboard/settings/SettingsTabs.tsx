"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const TABS = ["Profile", "Services", "Availability", "Payments", "Connections"] as const;
type Tab = (typeof TABS)[number];

export function SettingsTabs({
  profile,
  services,
  availability,
  payments,
  connections,
  initialTab,
}: {
  profile: ReactNode;
  services: ReactNode;
  availability: ReactNode;
  payments: ReactNode;
  connections: ReactNode;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "Profile");
  const content: Record<Tab, ReactNode> = { Profile: profile, Services: services, Availability: availability, Payments: payments, Connections: connections };

  return (
    <div>
      <div role="tablist" aria-label="Settings sections" className="flex items-center gap-1 mb-6 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-1 rounded-full bg-black/[0.04] p-1 w-max">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "h-8 px-3.5 rounded-full text-[13px] font-semibold transition-colors shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                tab === t ? "bg-white text-ink shadow-xs" : "text-ink/55 hover:text-ink"
              )}
            >
              {t === "Connections" ? "Integrations" : t}
            </button>
          ))}
        </div>
      </div>
      {content[tab]}
    </div>
  );
}
