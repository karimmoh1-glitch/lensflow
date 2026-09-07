"use client";

import { PlanButton } from "./PlanActions";

/** Phone only: the one action this page exists for, always under the thumb. */
export function MobileUpgradeBar({ planKey, label, price }: { planKey: "PRO" | "BUSINESS"; label: string; price: string }) {
  return (
    <div className="md:hidden fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 px-4 pointer-events-none">
      <div className="pointer-events-auto rounded-2xl border border-border bg-white/95 backdrop-blur shadow-popover px-3.5 py-2.5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink truncate">{label}</div>
          <div className="text-[11px] text-ink/65">{price} / month · cancel anytime</div>
        </div>
        <div className="shrink-0 w-36"><PlanButton planKey={planKey} label={label.replace("Upgrade to ", "")} /></div>
      </div>
    </div>
  );
}
