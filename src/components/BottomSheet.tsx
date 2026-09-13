"use client";

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModalFocus } from "@/components/useModalFocus";

/**
 * The app's one sheet primitive. On a phone it rises from the bottom with a grab handle and
 * sits above the tab bar; from tablet up it is a centered dialog. Focus, Tab, Escape, scroll
 * lock and focus return come from useModalFocus, the same as every other modal; the
 * backdrop closes it too.
 */
export function BottomSheet({ open, onClose, title, subtitle, icon, children, size = "md", className }: { open: boolean; onClose: () => void; title: string; subtitle?: string; icon?: ReactNode; children: ReactNode; size?: "md" | "lg"; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, open, onClose);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] overflow-y-auto" role="presentation">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} aria-hidden />
      <div className="relative min-h-full flex items-end sm:items-center justify-center p-0 sm:p-6">
        <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cn("relative w-full max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-overlay dt-sheet pb-[env(safe-area-inset-bottom)]", size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg", className)}>
          <div className="sm:hidden pt-2.5 flex justify-center" aria-hidden><span className="w-9 h-1 rounded-full bg-ink/15" /></div>
          <div className="sticky top-0 z-10 bg-white border-b border-border px-5 py-3 flex items-center gap-3">
            {icon && <span className="w-8 h-8 rounded bg-paper flex items-center justify-center shrink-0">{icon}</span>}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink truncate">{title}</div>
              {subtitle && <div className="text-xs text-ink/65 truncate">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded flex items-center justify-center text-ink/70 hover:text-ink hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70"><X className="w-4 h-4" strokeWidth={1.75} /></button>
          </div>
          <div className="px-5 py-5">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
