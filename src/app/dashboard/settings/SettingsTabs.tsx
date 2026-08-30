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
      <div className="flex items-center gap-1 border-b border-border mb-6 -mt-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t ? "border-ink text-ink" : "border-transparent text-ink/45 hover:text-ink/70"
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {content[tab]}
    </div>
  );
}
