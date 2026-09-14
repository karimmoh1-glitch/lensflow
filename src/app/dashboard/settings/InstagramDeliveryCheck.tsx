"use client";

import { useState, useTransition } from "react";
import { checkInstagramDelivery } from "@/app/actions/connect";
import type { DeliveryCheck } from "@/server/instagramDelivery";

/**
 * Asks Meta, live, whether DMs to this account will actually reach Daythread, and shows
 * each link in that chain separately so a silent failure names itself. Nothing here is a
 * credential: every value is a state, a count or a time.
 */
export function InstagramDeliveryCheck({ initial }: { initial: DeliveryCheck | null }) {
  const [check, setCheck] = useState<DeliveryCheck | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      setError(null);
      const r = await checkInstagramDelivery();
      if (!r.ok) return setError(r.error);
      setCheck(r.check);
    });

  const rows: Array<{ label: string; state: "ok" | "bad" | "unknown"; detail: string }> = check
    ? [
        {
          label: "App subscribes to messages",
          state: check.app.error ? "unknown" : check.app.messagesField ? "ok" : "bad",
          detail: check.app.error ? "Meta would not say. This is configured in the app dashboard, not by Daythread." : check.app.messagesField ? (check.app.callbackMatches ? "Pointing at this deployment" : "Configured, but the callback URL is a different deployment") : "No messages field on the app, so Meta delivers nothing",
        },
        {
          label: "Account subscribes the app",
          state: check.account.error ? "unknown" : check.account.subscribed ? "ok" : "bad",
          detail: check.account.error ?? (check.account.subscribed ? `Fields: ${check.account.fields.join(", ") || "messages"}` : "Reconnect Instagram to re-subscribe"),
        },
        {
          label: "Meta has a customer message",
          state: check.mailbox.error ? "unknown" : check.mailbox.withInbound > 0 ? "ok" : "bad",
          detail: check.mailbox.error ?? (check.mailbox.withInbound > 0 ? `${check.mailbox.withInbound} conversation${check.mailbox.withInbound === 1 ? "" : "s"} with a message from someone else, latest ${check.mailbox.latestInboundAt ? new Date(check.mailbox.latestInboundAt).toLocaleString() : "unknown"} from ${check.mailbox.latestInboundFrom ?? "unknown"}` : "Meta reports no customer message on this account"),
        },
        {
          label: "Events reaching Daythread",
          state: check.deliveries.last24h > 0 ? "ok" : "bad",
          detail: check.deliveries.last24h > 0 ? `${check.deliveries.last24h} in the last 24 hours${check.deliveries.lastReasons.length ? `, last one ignored: ${check.deliveries.lastReasons.join(", ")}` : ""}` : check.deliveries.lastDeliveryAt ? `None in 24 hours. Last ever ${new Date(check.deliveries.lastDeliveryAt).toLocaleString()}` : "None ever received",
        },
      ]
    : [];

  const dot = { ok: "bg-success", bad: "bg-warning", unknown: "bg-black/25" } as const;

  return (
    <div className="rounded-xl border border-border bg-paper/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-ink/75">Delivery check</p>
        <button type="button" onClick={run} disabled={pending} className="text-[11px] font-semibold text-ink/70 hover:text-ink disabled:opacity-60">
          {pending ? "Asking Meta…" : check ? "Check again" : "Run check"}
        </button>
      </div>
      {error && <p role="alert" className="mt-1.5 text-[11px] text-warning-text">{error}</p>}
      {!check && !error && <p className="mt-1 text-[11px] text-ink/65">Asks Meta whether DMs to this account will actually arrive here, and shows where the chain breaks.</p>}
      {check && (
        <>
          <ul className="mt-2 space-y-1.5">
            {rows.map((r) => (
              <li key={r.label} className="flex gap-2 items-start">
                <span aria-hidden className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dot[r.state]}`} />
                <span className="min-w-0">
                  <span className="text-ink/80">{r.label}</span>
                  <span className="block text-[11px] text-ink/65 leading-snug">{r.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink/75 leading-relaxed border-t border-border pt-2">{check.verdict}</p>
          <p className="mt-1 text-[10px] text-ink/50">Checked {new Date(check.checkedAt).toLocaleString()}</p>
        </>
      )}
    </div>
  );
}
