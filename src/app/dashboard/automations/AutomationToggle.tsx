"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleAutomation } from "@/app/actions/automations";
import { cn } from "@/lib/utils";

export function AutomationToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      role="switch"
      aria-checked={enabled}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await toggleAutomation(id, !enabled);
          router.refresh();
        })
      }
      className={cn("w-11 h-6 rounded-full transition-colors relative shrink-0", enabled ? "bg-accent" : "bg-black/15")}
    >
      <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform", enabled && "translate-x-5")} />
    </button>
  );
}
