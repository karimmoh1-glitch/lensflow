"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { reconcileChannels } from "@/app/actions/sync";
import { useToast } from "@/components/Toaster";

/**
 * "Check for messages": reconcile every connected channel with its provider — the repair
 * for a missed webhook, not the way messages normally arrive (that is the live stream).
 * Idempotent, throttled per connection on the server, and honest about what it found.
 */
const LABEL: Record<string, string> = { EMAIL: "Gmail", INSTAGRAM: "Instagram" };

export function CheckMessagesButton() {
  const [pending, start] = useTransition();
  const [last, setLast] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  function run() {
    start(async () => {
      const r = await reconcileChannels();
      if (!r.ok) { toast({ tone: "signal", title: "Couldn't check", body: r.error }); return; }
      const parts = r.results.map((x) => `${LABEL[x.provider] ?? x.provider}: ${x.ok ? (x.skipped ? "checked a moment ago" : `${x.ingested ?? 0} new`) : x.error ?? "failed"}`);
      const failed = r.results.filter((x) => !x.ok);
      toast({ tone: failed.length ? "signal" : r.ingested > 0 ? "outcome" : "neutral", title: r.results.length === 0 ? "No channel to check" : r.ingested > 0 ? `${r.ingested} new message${r.ingested === 1 ? "" : "s"}` : "Up to date", body: parts.join(" · ") || "Connect Gmail or Instagram to pull messages." });
      setLast(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      if (r.ingested > 0) router.refresh();
    });
  }
  return (
    <button type="button" onClick={run} disabled={pending} aria-label="Check for messages" title={last ? `Last checked ${last}` : "Check connected channels for anything the webhooks missed"} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border bg-white text-xs font-semibold text-ink/80 hover:text-ink hover:border-ink/30 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
      <RefreshCw className={pending ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} strokeWidth={2.25} aria-hidden />
      {pending ? "Checking…" : "Check for messages"}
    </button>
  );
}
