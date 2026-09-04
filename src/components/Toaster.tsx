"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Notifications in the product's own language. A toast is a node on a short thread: the
 * dot carries the meaning (green outcome, violet Daythread did something, coral needs
 * you), the text says what happened, an optional action undoes or follows up. They
 * arrive with a settle, leave quietly, never stack past three, and pause while hovered.
 */
export type ToastTone = "outcome" | "thinking" | "signal" | "neutral";
type Toast = { id: number; title: string; body?: string; tone: ToastTone; action?: { label: string; onClick: () => void }; ttl: number };
type Ctx = { toast: (t: Omit<Toast, "id" | "ttl"> & { ttl?: number }) => void };

const ToastContext = createContext<Ctx | null>(null);
export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  return ctx ?? { toast: () => {} };
}

const DOT: Record<ToastTone, string> = { outcome: "bg-success", thinking: "bg-signal", signal: "bg-accent", neutral: "bg-ink/40" };

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback<Ctx["toast"]>((t) => {
    const id = ++seq.current;
    setToasts((cur) => [...cur.slice(-2), { ...t, id, ttl: t.ttl ?? 4200 }]);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 w-[min(420px,calc(100vw-2rem))] md:bottom-6 md:left-auto md:right-6 md:translate-x-0 md:items-end">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const paused = useRef(false);
  useEffect(() => {
    let remaining = toast.ttl;
    let last = Date.now();
    let timer = setTimeout(tick, 100);
    function tick() {
      const now = Date.now();
      if (!paused.current) remaining -= now - last;
      last = now;
      if (remaining <= 0) {
        setLeaving(true);
        setTimeout(onDone, 260);
        return;
      }
      timer = setTimeout(tick, 100);
    }
    return () => clearTimeout(timer);
  }, [toast.ttl, onDone]);
  return (
    <div
      role="status"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      className={cn(
        "pointer-events-auto w-full md:w-auto md:min-w-[280px] md:max-w-[420px] flex items-start gap-3 rounded-2xl border border-ink/10 bg-white/95 backdrop-blur px-4 py-3 shadow-[0_18px_44px_-20px_rgba(16,17,20,0.35)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        leaving ? "opacity-0 translate-y-2 scale-[0.98]" : "dt-land"
      )}
    >
      <span aria-hidden className="mt-[7px] flex flex-col items-center">
        <span className={cn("w-[9px] h-[9px] rounded-full", DOT[toast.tone])} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink leading-snug">{toast.title}</div>
        {toast.body && <div className="text-xs text-ink/60 mt-0.5 leading-snug">{toast.body}</div>}
      </div>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            setLeaving(true);
            setTimeout(onDone, 260);
          }}
          className="text-xs font-bold text-ink/70 hover:text-ink px-2 py-1 -mr-1 rounded-md hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 shrink-0"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
