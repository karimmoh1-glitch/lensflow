"use client";

import { Children, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { disconnectIntegration, retrySync } from "@/app/actions/connect";
import type { IntegrationProvider } from "@prisma/client";
import type { DisplayStatus } from "@/lib/integrations/registry";

/**
 * One integration, one honest state. "Connected" only after a real authorization;
 * "Reconnect" when the provider revoked us; "Sync issue · Retry" when the last run failed;
 * "Connect" otherwise. The connect button submits a server action that redirects to the
 * provider's own screen — there is nowhere to type a key.
 */
export type CardModel = {
  provider: IntegrationProvider;
  name: string;
  summary: string;
  status: DisplayStatus;
  account: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  detail: string | null;
  approval: string | null;
  capabilities: string[];
  entitled: boolean;
  canRetry: boolean;
};

const STATUS_LABEL: Record<DisplayStatus, string> = { connected: "Connected", needs_attention: "Needs attention", sync_issue: "Sync issue", disconnected: "Not connected", unavailable: "Not available yet", always_on: "Always on" };
const STATUS_TONE: Record<DisplayStatus, string> = { connected: "text-success-text", needs_attention: "text-accent-text", sync_issue: "text-warning-text", disconnected: "text-ink/50", unavailable: "text-ink/45", always_on: "text-success-text" };
const DOT: Record<DisplayStatus, string> = { connected: "bg-success", needs_attention: "bg-accent", sync_issue: "bg-warning", disconnected: "bg-ink/25", unavailable: "bg-ink/20", always_on: "bg-success" };

export function IntegrationCard({ model, icon, connect, children }: { model: CardModel; icon: React.ReactNode; connect?: (formData: FormData) => Promise<void>; children?: React.ReactNode }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const connected = model.status === "connected" || model.status === "sync_issue" || model.status === "needs_attention";

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
      if (!r.ok) return toast({ tone: "signal", title: "Sync still failing", body: r.error });
      toast({ tone: "outcome", title: `${model.name} synced` });
      router.refresh();
    });
  }

  return (
    <section aria-label={model.name} className="rounded-[22px] border border-border bg-white overflow-hidden">
      <div className="px-5 py-4 flex items-start gap-4">
        <span className="shrink-0 mt-0.5">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-ink">{model.name}</h3>
            <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold", STATUS_TONE[model.status])}>
              <span aria-hidden className={cn("w-1.5 h-1.5 rounded-full", DOT[model.status])} />
              {STATUS_LABEL[model.status]}
            </span>
          </div>
          {connected && model.account && <p className="mt-0.5 text-sm text-ink/80 truncate">{model.account}</p>}
          <p className="mt-0.5 text-xs text-ink/55 leading-snug">{model.summary}</p>
          {connected && model.lastSyncedAt && model.status === "connected" && <p className="mt-1 text-[11px] text-ink/45">Last synced {model.lastSyncedAt}</p>}
          {model.status === "sync_issue" && <p className="mt-1 text-[11px] text-warning-text">{model.lastError ?? "The last sync failed."}{model.lastSyncedAt ? ` · last good sync ${model.lastSyncedAt}` : ""}</p>}
          {model.status === "needs_attention" && <p className="mt-1 text-[11px] text-accent-text">{model.lastError ?? "Access was revoked."} Reconnect to continue.</p>}
          {model.status === "unavailable" && <p className="mt-1 text-[11px] text-ink/50">{model.detail ?? "Daythread's operator hasn't enabled this provider on this deployment yet."}</p>}
          {model.status === "disconnected" && !model.entitled && <p className="mt-1 text-[11px] text-ink/50">{model.detail}</p>}
          {model.approval && model.status !== "always_on" && (
            <details className="mt-1.5 text-[11px] text-ink/45">
              <summary className="cursor-pointer select-none hover:text-ink/70">What the provider requires</summary>
              <p className="mt-1 leading-relaxed">{model.approval}</p>
            </details>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {model.status === "sync_issue" && model.canRetry && (
            <Button variant="outline" size="sm" onClick={retry} loading={pending} loadingLabel="Syncing">Retry</Button>
          )}
          {(model.status === "disconnected" || model.status === "needs_attention") && connect && model.entitled && (
            <form action={connect}>
              <Button type="submit" size="sm" variant={model.status === "needs_attention" ? "primary" : "outline"}>{model.status === "needs_attention" ? "Reconnect" : "Connect"}</Button>
            </form>
          )}
          {connected && !confirm && (
            <button type="button" onClick={() => setConfirm(true)} disabled={pending} className="text-xs font-semibold text-ink/50 hover:text-ink px-2 py-1 rounded-md hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Disconnect</button>
          )}
          {connected && confirm && (
            <span className="inline-flex items-center gap-1">
              <Button size="sm" variant="danger" onClick={disconnect} loading={pending} loadingLabel="Disconnecting">Disconnect</Button>
              <button type="button" onClick={() => setConfirm(false)} className="text-xs text-ink/50 px-2 py-1">Keep</button>
            </span>
          )}
        </div>
      </div>
      {Children.toArray(children).some(Boolean) && <div className="border-t border-border bg-paper/50 px-5 py-3">{children}</div>}
    </section>
  );
}
