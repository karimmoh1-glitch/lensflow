"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The app's one sheet primitive. On a phone it rises from the bottom with a grab handle and
 * sits above the tab bar; from tablet up it is a centered dialog. Focus moves in on open,
 * Escape and the backdrop close it, and the page behind stops scrolling — the contract a
 * modal owes keyboard and screen-reader users, not just a visual overlay.
 */
export function BottomSheet({ open, onClose, title, subtitle, icon, children, size = "md", className }: { open: boolean; onClose: () => void; title: string; subtitle?: string; icon?: ReactNode; children: ReactNode; size?: "md" | "lg"; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>('a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])')?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] overflow-y-auto" role="presentation">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className="relative min-h-full flex items-end sm:items-center justify-center p-0 sm:p-6">
        <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cn("relative w-full max-h-[92vh] overflow-y-auto rounded-t-[26px] sm:rounded-[26px] bg-white shadow-elev-3 dt-land pb-[env(safe-area-inset-bottom)]", size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg", className)}>
          <div className="sm:hidden pt-2.5 flex justify-center" aria-hidden><span className="w-10 h-1 rounded-full bg-black/15" /></div>
          <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-border px-5 py-3.5 flex items-center gap-3">
            {icon && <span className="w-8 h-8 rounded-lg border border-border bg-paper flex items-center justify-center shrink-0">{icon}</span>}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink truncate">{title}</div>
              {subtitle && <div className="text-[11px] text-ink/60 truncate">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-md flex items-center justify-center text-ink/65 hover:text-ink hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"><X className="w-4 h-4" strokeWidth={2} /></button>
          </div>
          <div className="px-5 py-5">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
