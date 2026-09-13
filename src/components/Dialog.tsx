"use client";

import { useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui";
import { useModalFocus } from "@/components/useModalFocus";

/**
 * The one modal. A real dialog: `role="dialog"`, `aria-modal`, named by its title, focus
 * moved inside on open and returned to the opener on close, Tab kept inside, Escape and a
 * click on the backdrop close it, and the page behind stops scrolling. Everything that
 * used to be a bare fixed overlay uses this, so every modal behaves the same way for a
 * keyboard and a screen reader.
 */
export function Dialog({ open, onClose, title, description, children, className, size = "sm" }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; className?: string; size?: "sm" | "md" | "lg" }) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(panel, open, onClose);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start justify-center sm:pt-24 bg-ink/30 px-0 sm:px-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        className={cn(
          "w-full rounded-t-2xl sm:rounded-2xl bg-white shadow-overlay p-5 max-h-[92svh] overflow-y-auto focus:outline-none dt-sheet",
          size === "sm" ? "sm:max-w-sm" : size === "md" ? "sm:max-w-md" : "sm:max-w-lg",
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-section-title font-semibold text-ink">{title}</h2>
            {description && <p id={`${id}-desc`} className="mt-1 text-13 text-ink/60">{description}</p>}
          </div>
          <IconButton aria-label="Close" onClick={onClose} className="-mr-1 -mt-1">
            <X className="w-4 h-4" strokeWidth={1.75} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
