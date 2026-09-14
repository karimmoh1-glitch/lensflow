"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Selection cards for one question. Single choice is a radio group; multiple choice is a
 * group of toggle buttons. Every card is a real button with a large target, so it works
 * by keyboard, by thumb and with a screen reader without any extra wiring.
 */
export function OptionGrid<K extends string>({
  label,
  options,
  value,
  onChange,
  multi = false,
  columns = 2,
  size = "md",
}: {
  label: string;
  options: readonly (readonly [K, string])[];
  value: K[] | K | undefined;
  onChange: (next: K) => void;
  multi?: boolean;
  columns?: 1 | 2 | 3;
  size?: "md" | "sm";
}) {
  const selected = (k: K) => (Array.isArray(value) ? value.includes(k) : value === k);
  return (
    <div role={multi ? "group" : "radiogroup"} aria-label={label} className={cn("grid gap-2.5", columns === 3 ? "grid-cols-1 sm:grid-cols-3" : columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
      {options.map(([k, text]) => {
        const on = selected(k);
        return (
          <button
            key={k}
            type="button"
            role={multi ? undefined : "radio"}
            aria-checked={multi ? undefined : on}
            aria-pressed={multi ? on : undefined}
            onClick={() => onChange(k)}
            className={cn(
              "group flex items-center gap-3 rounded-2xl border bg-white text-left transition-[border-color,background-color,transform,box-shadow] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2",
              size === "md" ? "min-h-[56px] px-4 py-3" : "min-h-[44px] px-3.5 py-2.5",
              on ? "border-ink shadow-[0_0_0_1px_#101114]" : "border-border hover:border-ink/30"
            )}
          >
            <span aria-hidden className={cn("shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors", on ? "bg-accent-strong border-accent-strong text-white" : "border-ink/25 bg-white")}>
              {on && <Check className="w-3 h-3" strokeWidth={3.5} />}
            </span>
            <span className={cn("font-semibold text-ink leading-snug", size === "md" ? "text-[15px]" : "text-sm")}>{text}</span>
          </button>
        );
      })}
    </div>
  );
}
