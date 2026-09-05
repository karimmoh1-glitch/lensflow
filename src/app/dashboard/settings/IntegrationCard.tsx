"use client";

import { Children, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, Check, ArrowRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { disconnectIntegration, retrySync } from "@/app/actions/connect";
import { CalendarSetup } from "./CalendarSetup";
import { AppleConnectDialog } from "./AppleConnectDialog";
import type { IntegrationProvider } from "@prisma/client";
import type { DisplayStatus } from "@/lib/integrations/registry";

/**
 * One integration, one honest state, one obvious action. The status comes from the
 * server row; the primary button always invokes a real flow (a server action that
 * redirects to the provider, or the Apple setup dialog). "Manage" opens a detail sheet.
 */
export type CardModel = {
  provider: IntegrationProvider;
  name: string;
  description: string;
  status: DisplayStatus;
  account: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  detail: string | null;
  adminNote: string | null;
  approval: string | null;
  capabilities: string[];
  entitled: boolean;
  calendarsConnected?: number;
  accent: string;
};

const LABEL: Record<DisplayStatus, string> = { connected: "Connected", needs_attention: "Needs attention", sync_issue: "Sync issue", disconnected: "Not connected", unavailable: "Not available yet", always_on: "Always on" };

export function IntegrationCard({ model, icon, connect, children }: { model: CardModel; icon: React.ReactNode; connect?: (formData: FormData) => Promise<void>; children?: React.ReactNode }) {
  const [open, setOpen] = useState<null | "manage" | "apple" | "setup">(null);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const isCalendar = model.provider === "GOOGLE_CALENDAR" || model.provider === "APPLE_CALENDAR";
  const connected = model.status === "connected" || model.status === "sync_issue" || model.status === "needs_attention";

  // Auto-open the setup sheet when the callback sent us back with ?setup=PROVIDER.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("setup") === model.provider && isCalendar) setOpen("setup");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  function disconnect() {
    setConfirm(false);
    start(async () => {
      const r = await disconnectIntegration(model.provider);
      if (r.error) return toast({ tone: "signal", title: "Couldn't disconnect", body: r.error });
      toast({ tone: "neutral", title: `${model.name} disconnected`, body: "Access has stopped. Nothing else was deleted." });
      router.refresh();
    });
  }
  function retry() {
    start(async () => {
      const r = await retrySync(model.provider);
      if (!r.ok) return toast({ tone: "signal", title: "Sync still failing", body: r.error ?? "Daythread will retry automatically." });
      toast({ tone: "outcome", title: `${model.name} synced` });
      router.refresh();
    });
  }
  function closeSheet() {
    setOpen(null);
    const url = new URL(window.location.href);
    if (url.searchParams.get("setup")) {
      url.searchParams.delete("setup");
      window.history.replaceState({}, "", url.toString());
    }
  }

  const statusPill = (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2 py-0.5", model.status === "connected" || model.status === "always_on" ? "bg-success-soft text-success-text" : model.status === "needs_attention" ? "bg-accent-soft text-accent-text" : model.status === "sync_issue" ? "bg-warning-soft text-warning-text" : "bg-black/[0.05] text-ink/55")}>
      {(model.status === "connected" || model.status === "always_on") && <Check className="w-3 h-3" strokeWidth={3} aria-hidden />}
      {LABEL[model.status]}
    </span>
  );

  const primary = (() => {
    if (model.status === "always_on") return null;
    if (model.status === "unavailable") return null;
    if (!model.entitled) return null;
    if (model.status === "needs_attention") {
      if (model.provider === "APPLE_CALENDAR") return <Button size="sm" onClick={() => setOpen("apple")}>Reconnect</Button>;
      if (connect) return <form action={connect} onSubmit={() => setConnecting(true)}><Button type="submit" size="sm" loading={connecting} loadingLabel="Opening">Reconnect</Button></form>;
    }
    if (model.status === "disconnected") {
      if (model.provider === "APPLE_CALENDAR") return <Button size="sm" onClick={() => setOpen("apple")}>Connect <ArrowRight className="w-3.5 h-3.5 ml-1" strokeWidth={2.5} aria-hidden /></Button>;
      if (connect) return <form action={connect} onSubmit={() => setConnecting(true)}><Button type="submit" size="sm" loading={connecting} loadingLabel="Connecting">Connect <ArrowRight className="w-3.5 h-3.5 ml-1" strokeWidth={2.5} aria-hidden /></Button></form>;
      return null;
    }
    if (model.status === "sync_issue" && isCalendar) return <Button size="sm" variant="outline" onClick={retry} loading={pending} loadingLabel="Syncing"><RefreshCw className="w-3.5 h-3.5 mr-1" strokeWidth={2} aria-hidden />Retry</Button>;
    return null;
  })();

  return (
    <>
      <article aria-label={model.name} className="group relative rounded-[22px] border border-border bg-white transition-all duration-200 hover:border-ink/20 hover:shadow-[0_18px_44px_-30px_rgba(16,17,20,0.35)] hover:-translate-y-px">
        <div aria-hidden className="absolute inset-x-0 top-0 h-[3px] rounded-t-[22px] opacity-80" style={{ background: connected || model.status === "always_on" ? model.accent : "transparent" }} />
        <div className="px-5 pt-5 pb-4 flex gap-4">
          <span className="shrink-0 mt-0.5 w-10 h-10 rounded-xl border border-border bg-paper flex items-center justify-center">{icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-semibold text-ink">{model.name}</h3>
              {statusPill}
            </div>
            {connected && model.account && <p className="mt-0.5 text-sm text-ink/80 truncate">{model.account}{model.calendarsConnected ? ` · ${model.calendarsConnected} calendar${model.calendarsConnected === 1 ? "" : "s"}` : ""}</p>}
            <p className="mt-1 text-sm text-ink/60 leading-snug">{model.description}</p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {model.capabilities.map((c) => (
                <li key={c} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50 bg-black/[0.04] rounded-md px-1.5 py-0.5">{c}</li>
              ))}
            </ul>
            {model.status === "connected" && model.lastSyncedAt && <p className="mt-2 text-[11px] text-ink/45">Last synced {model.lastSyncedAt}</p>}
            {model.status === "sync_issue" && <p className="mt-2 text-[11px] text-warning-text">Calendar sync temporarily failed. Daythread will retry automatically{model.lastSyncedAt ? ` · last good sync ${model.lastSyncedAt}` : ""}.</p>}
            {model.status === "needs_attention" && <p className="mt-2 text-[11px] text-accent-text">Your {model.name} connection needs to be renewed.</p>}
            {model.status === "unavailable" && <p className="mt-2 text-[11px] text-ink/50">{model.detail}</p>}
            {model.status === "disconnected" && !model.entitled && model.detail && <p className="mt-2 text-[11px] text-ink/50">{model.detail}</p>}
            {model.adminNote && <p className="mt-2 text-[11px] text-warning-text">{model.adminNote}</p>}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            {primary}
            {connected && (
              <div className="flex items-center gap-1">
                {isCalendar && <button type="button" onClick={() => setOpen("manage")} className="text-xs font-semibold text-ink/60 hover:text-ink px-2 py-1 rounded-md hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Manage</button>}
                {!isCalendar && !confirm && <button type="button" onClick={() => setConfirm(true)} disabled={pending} className="text-xs font-semibold text-ink/50 hover:text-ink px-2 py-1 rounded-md hover:bg-black/[0.05]">Disconnect</button>}
                {!isCalendar && confirm && (
                  <span className="inline-flex items-center gap-1">
                    <Button size="sm" variant="danger" onClick={disconnect} loading={pending} loadingLabel="Disconnecting">Disconnect</Button>
                    <button type="button" onClick={() => setConfirm(false)} className="text-xs text-ink/50 px-2 py-1">Keep</button>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {Children.toArray(children).some(Boolean) && <div className="border-t border-border bg-paper/60 px-5 py-3 rounded-b-[22px]">{children}</div>}
        {model.approval && model.status !== "always_on" && (
          <details className="border-t border-border px-5 py-2.5 text-[11px] text-ink/45">
            <summary className="cursor-pointer select-none hover:text-ink/70">What {model.name} requires</summary>
            <p className="mt-1 leading-relaxed">{model.approval}</p>
          </details>
        )}
      </article>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[80] overflow-y-auto" role="presentation">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={closeSheet} aria-hidden />
          <div className="relative min-h-full flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div role="dialog" aria-modal="true" aria-label={`${model.name} ${open === "manage" ? "settings" : "setup"}`} className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-[26px] sm:rounded-[26px] bg-white shadow-[0_40px_100px_-30px_rgba(16,17,20,0.5)] dt-land">
            <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-border px-5 py-3.5 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg border border-border bg-paper flex items-center justify-center">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{model.name}</div>
                <div className="text-[11px] text-ink/50">{open === "manage" ? "Manage connection" : open === "apple" ? "Connect with an app-specific password" : "Choose calendars"}</div>
              </div>
              <button type="button" onClick={closeSheet} aria-label="Close" className="w-8 h-8 rounded-md flex items-center justify-center text-ink/55 hover:text-ink hover:bg-black/[0.05]"><X className="w-4 h-4" strokeWidth={2} /></button>
            </div>
            <div className="px-5 py-5">
              {open === "apple" && <AppleConnectDialog onClose={closeSheet} />}
              {(open === "manage" || open === "setup") && isCalendar && (
                <CalendarSetup provider={model.provider as "GOOGLE_CALENDAR" | "APPLE_CALENDAR"} mode={open} onDone={closeSheet} reconnect={model.provider === "APPLE_CALENDAR" ? <Button size="sm" onClick={() => setOpen("apple")}>Reconnect</Button> : connect ? <form action={connect}><Button type="submit" size="sm">Reconnect</Button></form> : null} />
              )}
            </div>
          </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
