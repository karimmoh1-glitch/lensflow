"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleAutomation } from "@/app/actions/automations";
import { cn } from "@/lib/utils";

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
              await toggleAutomation(id, !enabled);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong.");
            }
          })
        }
        className={cn(
          "w-11 h-6 rounded-full transition-colors relative shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1",
          enabled ? "bg-accent" : "bg-black/15"
        )}
      >
        <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform", enabled && "translate-x-5")} />
      </button>
      {error && <p className="text-xs text-danger-text max-w-[180px] text-right">{error}</p>}
    </div>
  );
}
