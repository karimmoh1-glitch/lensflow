"use client";

import { PaywallTrigger } from "@/components/Paywall";

import { Children, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "@/components/useModalFocus";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Check, ArrowRight, RefreshCw, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { disconnectIntegration, retrySync } from "@/app/actions/connect";
import { CalendarSetup } from "./CalendarSetup";
import { AppleConnectDialog } from "./AppleConnectDialog";
import type { IntegrationProvider } from "@prisma/client";
import type { DisplayStatus, Maturity } from "@/lib/integrations/registry";
import { RequestAccess, type AccessModel } from "./RequestAccess";
import type { ConnectionState } from "@/lib/meta/config";
export type { DisplayStatus };

/**
 * One integration, one honest state, one obvious action. The status comes from the
 * server row; the primary button always invokes a real flow (a server action that
 * redirects to the provider, or the Apple setup dialog). "Manage" opens a detail sheet.
 */
export type CardModel = {
  provider: IntegrationProvider;
  /** CONNECTED | NOT_CONNECTED | CONFIGURATION_REQUIRED | REAUTH_REQUIRED | ERROR. */
  configState: ConnectionState;
  name: string;
  description: string;
  status: DisplayStatus;
  /** ga | beta (invite-only) | coming_soon — decided by the deployment, never by the row. */
  maturity: Maturity;
  /** Present only while the provider is invite-only and this workspace isn't approved yet. */
  access: AccessModel | null;
  canAsk: boolean;
  account: string | null;
  lastSyncedAt: string | null;
  /** When the provider last delivered a verified event here (webhook channels). */
  lastReceivedAt: string | null;
  lastError: string | null;
  detail: string | null;
  adminNote: string | null;
  approval: string | null;
  capabilities: string[];
  entitled: boolean;
  /** The status pill, decided on the server from the row, the deployment and the plan. */
  pill: { label: string; tone: "success" | "warning" | "accent" | "signal" | "neutral" };
  /** Why Connect is withheld by the plan, and where to fix it. */
  limit: { message: string; upgradePlan: string | null; upgradeHref: string } | null;
  calendarsConnected?: number;
};

const PILL: Record<CardModel["pill"]["tone"], string> = { success: "bg-success-soft text-success-text", warning: "bg-warning-soft text-warning-text", accent: "bg-accent-soft text-accent-text", signal: "bg-ink/[0.05] text-ink/75", neutral: "bg-ink/[0.05] text-ink/70" };

export function IntegrationCard({ model, icon, connect, manage, children }: { model: CardModel; icon: React.ReactNode; connect?: (formData: FormData) => Promise<void>; /** Detail shown in the Manage sheet for a non-calendar provider (WhatsApp's number and window rules). */ manage?: React.ReactNode; children?: React.ReactNode }) {
  const [open, setOpen] = useState<null | "manage" | "apple" | "setup">(null);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const isCalendar = model.provider === "GOOGLE_CALENDAR" || model.provider === "APPLE_CALENDAR" || model.provider === "MICROSOFT_CALENDAR";
  const hasManage = isCalendar || Boolean(manage);
  const retryable = isCalendar || model.provider === "MICROSOFT_OUTLOOK" || model.provider === "CALENDLY" || model.provider === "SLACK";
  const connected = model.status === "connected" || model.status === "sync_issue" || model.status === "needs_attention";

  // Auto-open the setup sheet when the callback sent us back with ?setup=PROVIDER.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("setup") === model.provider && isCalendar) setOpen("setup");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Focus in, Tab kept inside, Escape, scroll lock and focus back to the button that opened it.
  const sheet = useRef<HTMLDivElement>(null);
  useModalFocus(sheet, Boolean(open), () => setOpen(null));

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
    <span className={cn("inline-flex items-center gap-1 h-5 text-xs font-medium rounded-sm px-1.5", PILL[model.pill.tone])}>
      {(model.status === "connected" || model.status === "always_on") && <Check className="w-3 h-3" strokeWidth={3} aria-hidden />}
      {model.pill.tone === "signal" && <Lock className="w-3 h-3" strokeWidth={2.5} aria-hidden />}
      {model.pill.label}
    </span>
  );

  const primary = (() => {
    if (model.status === "always_on") return null;
    if (model.maturity === "coming_soon") return null;
    if (model.access) return <RequestAccess provider={model.provider} name={model.name} access={model.access} canAsk={model.canAsk} />;
    if (model.status === "unavailable") return null;
    if (!model.entitled) {
      if (model.limit) {
        return (
          <PaywallTrigger feature={model.provider === "SMS" ? "sms" : "channels"} source="settings-channels" className="inline-flex items-center justify-center h-8 px-3 rounded text-13 font-medium border border-border-strong text-ink bg-white shadow-xs hover:bg-paper transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 whitespace-nowrap">{model.limit.upgradePlan ? `Unlock with ${model.limit.upgradePlan}` : "See plans"}</PaywallTrigger>
        );
      }
      return null;
    }
    if (model.status === "needs_attention") {
      if (model.provider === "APPLE_CALENDAR") return <Button size="sm" onClick={() => setOpen("apple")}>Reconnect</Button>;
      if (connect) return <form action={connect} onSubmit={() => setConnecting(true)}><Button type="submit" size="sm" loading={connecting} loadingLabel="Opening">Reconnect</Button></form>;
    }
    if (model.status === "disconnected") {
      if (model.provider === "APPLE_CALENDAR") return <Button size="sm" onClick={() => setOpen("apple")}>Connect </Button>;
      if (connect) return <form action={connect} onSubmit={() => setConnecting(true)}><Button type="submit" size="sm" loading={connecting} loadingLabel="Connecting">Connect </Button></form>;
      return null;
    }
    if (model.status === "sync_issue" && retryable) return <Button size="sm" variant="outline" onClick={retry} loading={pending} loadingLabel="Syncing"><RefreshCw className="w-3.5 h-3.5 mr-1" strokeWidth={1.75} aria-hidden />Retry</Button>;
    return null;
  })();

  const actions = (
    <>
      {primary}
      {connected && (
        <div className="flex flex-wrap items-center gap-1 sm:justify-end">
          {hasManage && (
            <button type="button" onClick={() => setOpen("manage")} className="text-13 sm:text-xs font-medium text-ink/65 hover:text-ink px-3 py-2 sm:px-2.5 sm:py-1.5 rounded hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">
              Manage
            </button>
          )}
          {/* A working connection can still be renewed — a re-grant is the fix for a
              permission the business later removed, or a webhook Meta never accepted. */}
          {!isCalendar && connect && model.status !== "needs_attention" && !confirm && (
            <form action={connect} onSubmit={() => setConnecting(true)}>
              <button type="submit" disabled={connecting} className="text-13 sm:text-xs font-medium text-ink/65 hover:text-ink px-3 py-2 sm:px-2.5 sm:py-1.5 rounded hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 disabled:opacity-60">
                {connecting ? "Opening…" : "Reconnect"}
              </button>
            </form>
          )}
          {!isCalendar && !confirm && (
            <button type="button" onClick={() => setConfirm(true)} disabled={pending} className="text-13 sm:text-xs font-medium text-ink/65 hover:text-ink px-3 py-2 sm:px-2.5 sm:py-1.5 rounded hover:bg-ink/[0.05]">
              Disconnect
            </button>
          )}
          {!isCalendar && confirm && (
            <span className="inline-flex items-center gap-1">
              <Button size="sm" variant="danger" onClick={disconnect} loading={pending} loadingLabel="Disconnecting">Disconnect</Button>
              <button type="button" onClick={() => setConfirm(false)} className="text-13 sm:text-xs text-ink/65 px-3 py-2 sm:px-2.5 sm:py-1.5">Keep</button>
            </span>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      <article aria-label={model.name} data-provider={model.provider} data-connection-state={model.configState} className="group relative rounded-lg border border-border bg-white">
        <div className="px-4 sm:px-5 py-4">
          <div className="flex gap-3.5 sm:gap-4">
          <span className="shrink-0 w-9 h-9 rounded-lg border border-border bg-white flex items-center justify-center">{icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-ink">{model.name}</h3>
              {statusPill}
            </div>
            {connected && model.account && <p className="mt-0.5 text-13 text-ink/80 truncate">{model.account}{model.calendarsConnected ? ` · ${model.calendarsConnected} calendar${model.calendarsConnected === 1 ? "" : "s"}` : ""}</p>}
            <p className="mt-1 text-13 text-ink/65">{model.description}</p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {model.capabilities.map((c) => (
                <li key={c} className="text-xs text-ink/65 bg-ink/[0.04] rounded-sm px-1.5 h-5 inline-flex items-center">{c}</li>
              ))}
            </ul>
            {model.status === "connected" && model.lastReceivedAt && <p className="mt-2 text-xs text-ink/65">Last message received {model.lastReceivedAt}</p>}
            {model.status === "connected" && model.lastSyncedAt && <p className="mt-2 text-xs text-ink/65">Last synced {model.lastSyncedAt}</p>}
            {model.status === "sync_issue" && !model.lastError && (
              <p className="mt-2 text-xs text-warning-text">
                {isCalendar ? "Calendar sync temporarily failed. Daythread will retry automatically" : `The last sync with ${model.name} failed. Messages already received are unaffected`}
                {model.lastSyncedAt ? ` · last good sync ${model.lastSyncedAt}` : ""}.
              </p>
            )}
            {model.status === "needs_attention" && <p className="mt-2 text-xs text-accent-text">Your {model.name} connection needs to be renewed.</p>}
            {model.status === "unavailable" && <p className="mt-2 text-xs text-ink/65">{model.detail}</p>}
            {model.status !== "unavailable" && (model.maturity === "coming_soon" || model.access) && model.detail && <p className="mt-2 text-xs text-ink/65">{model.detail}</p>}
            {model.limit && (model.status === "disconnected" || model.status === "needs_attention") && (
              <div className="mt-2.5 rounded-lg border border-border bg-ink/[0.03] px-3 py-2">
                <p className="text-xs font-semibold text-ink">{/limit reached/i.test(model.limit.message) ? "Integration limit reached" : "Upgrade required"}</p>
                <p className="mt-0.5 text-xs text-ink/70 leading-relaxed">{model.limit.message.replace(/^Integration limit reached\.\s*/i, "")}</p>
              </div>
            )}
            {model.status === "disconnected" && !model.entitled && !model.limit && model.detail && model.maturity === "ga" && !model.access && <p className="mt-2 text-xs text-ink/65">{model.detail}</p>}
            {model.lastError && model.status !== "unavailable" && <p className="mt-2 text-xs text-warning-text leading-snug">{model.lastError}</p>}
            {model.adminNote && <p className="mt-2 text-xs text-warning-text">{model.adminNote}</p>}
          </div>
          <div className="hidden sm:flex shrink-0 flex-col items-end gap-2">{actions}</div>
          </div>
          {/* On a phone the actions get their own full-width row: 44px targets, never a
              cramped column squeezed beside the text. */}
          <div className="sm:hidden mt-3.5 flex flex-wrap items-center gap-2">{actions}</div>
        </div>
        {Children.toArray(children).some(Boolean) && <div className="border-t border-border bg-paper px-4 sm:px-5 py-3 rounded-b-lg">{children}</div>}
        {model.approval && model.status !== "always_on" && model.maturity !== "coming_soon" && (
          <details className="border-t border-border px-4 sm:px-5 py-2.5 text-xs text-ink/65">
            <summary className="cursor-pointer select-none hover:text-ink/70">What {model.name} requires</summary>
            <p className="mt-1 leading-relaxed">{model.approval}</p>
          </details>
        )}
      </article>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[80] overflow-y-auto" role="presentation">
          <div className="absolute inset-0 bg-ink/30" onClick={closeSheet} aria-hidden />
          <div className="relative min-h-full flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div ref={sheet} role="dialog" aria-modal="true" aria-label={`${model.name} ${open === "manage" ? "settings" : "setup"}`} className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-overlay dt-sheet">
            <div className="sticky top-0 bg-white border-b border-border px-5 py-3.5 flex items-center gap-3">
              <span className="w-8 h-8 rounded border border-border bg-white flex items-center justify-center">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{model.name}</div>
                <div className="text-xs text-ink/65">{open === "manage" ? "Manage connection" : open === "apple" ? "Connect with an app-specific password" : "Choose calendars"}</div>
              </div>
              <button type="button" onClick={closeSheet} aria-label="Close" className="w-11 h-11 sm:w-8 sm:h-8 -mr-1.5 sm:mr-0 rounded-lg flex items-center justify-center text-ink/70 hover:text-ink hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70"><X className="w-4 h-4" strokeWidth={1.75} /></button>
            </div>
            {/* Bottom sheet on a phone: the home-indicator inset is part of the padding so
                the last control is never under it. */}
            <div className="px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5">
              {open === "apple" && <AppleConnectDialog onClose={closeSheet} />}
              {open === "manage" && !isCalendar && manage}
              {(open === "manage" || open === "setup") && isCalendar && (
                <CalendarSetup provider={model.provider as "GOOGLE_CALENDAR" | "APPLE_CALENDAR" | "MICROSOFT_CALENDAR"} mode={open} onDone={closeSheet} reconnect={model.provider === "APPLE_CALENDAR" ? <Button size="sm" onClick={() => setOpen("apple")}>Reconnect</Button> : connect ? <form action={connect}><Button type="submit" size="sm">Reconnect</Button></form> : null} />
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
