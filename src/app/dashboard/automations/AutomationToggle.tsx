"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleAutomation } from "@/app/actions/automations";
import { cn } from "@/lib/utils";
import { EntitlementNotice } from "@/components/UpgradePrompt";

export function AutomationToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        role="switch"
        aria-checked={enabled}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const res = await toggleAutomation(id, !enabled);
              if (res?.error) {
                setError(res.error);
                return;
              }
              router.refresh();
            } catch {
              setError("Couldn't update this automation. Your settings are unchanged — try again.");
            }
          })
        }
        className={cn(
          "w-11 h-6 rounded-full transition-colors duration-200 relative shrink-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2",
          enabled ? "bg-success" : "bg-black/15",
          pending && "opacity-70"
        )}
      >
        <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-[0_1px_3px_rgba(16,17,20,0.3)] transition-transform duration-200 ease-[cubic-bezier(0.22,1.2,0.36,1)]", enabled && "translate-x-5")} />
      </button>
      {error && <EntitlementNotice message={error} />}
    </div>
  );
}
