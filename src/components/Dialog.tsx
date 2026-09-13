"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui";

/**
 * The one modal. A real dialog: `role="dialog"`, `aria-modal`, named by its title, focus
 * moved inside on open and returned to the opener on close, Tab kept inside, Escape and a
 * click on the backdrop close it, and the page behind stops scrolling. Everything that
 * used to be a bare fixed overlay uses this, so every modal behaves the same way for a
 * keyboard and a screen reader.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onClose, title, description, children, className, size = "sm" }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; className?: string; size?: "sm" | "md" | "lg" }) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const el = panel.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start justify-center sm:pt-24 bg-black/30 px-0 sm:px-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        className={cn(
          "w-full rounded-t-2xl sm:rounded-xl border border-border bg-white shadow-overlay p-5 sm:p-6 max-h-[92svh] overflow-y-auto focus:outline-none dt-land",
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
            <X className="w-4 h-4" strokeWidth={2} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
