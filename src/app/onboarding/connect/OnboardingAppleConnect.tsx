"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight, Apple } from "lucide-react";
import { AppleConnectDialog } from "@/app/dashboard/settings/AppleConnectDialog";

export function OnboardingAppleConnect() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-ink text-white text-sm font-extrabold hover:bg-graphite active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Connect <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden /></button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[80] overflow-y-auto" role="presentation">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />
          <div className="relative min-h-full flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div role="dialog" aria-modal="true" aria-label="Apple Calendar setup" className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-[26px] sm:rounded-[26px] bg-white shadow-[0_40px_100px_-30px_rgba(16,17,20,0.5)] dt-land">
            <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-border px-5 py-3.5 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg border border-border bg-paper flex items-center justify-center"><Apple className="w-4 h-4 text-ink" strokeWidth={2} aria-hidden /></span>
              <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-ink">Apple Calendar</div><div className="text-[11px] text-ink/50">Connect with an app-specific password</div></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="w-8 h-8 rounded-md flex items-center justify-center text-ink/55 hover:text-ink hover:bg-black/[0.05]"><X className="w-4 h-4" strokeWidth={2} /></button>
            </div>
            <div className="px-5 py-5"><AppleConnectDialog onClose={() => setOpen(false)} /></div>
          </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
