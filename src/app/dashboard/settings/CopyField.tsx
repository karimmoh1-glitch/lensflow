"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A read-only public URL with a copy button — used for the values that have to be pasted
 * into another dashboard. Never used for anything secret. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the value is selectable either way */
    }
  }
  return (
    <div className="rounded-xl border border-border bg-paper/60 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/45">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 text-[11px] font-mono text-ink/80 break-all">{value || "— set NEXT_PUBLIC_APP_URL —"}</code>
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          aria-label={`Copy ${label}`}
          className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-border text-[11px] font-semibold text-ink/70 hover:text-ink hover:border-ink/25 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {copied ? <Check className="w-3 h-3" strokeWidth={3} aria-hidden /> : <Copy className="w-3 h-3" strokeWidth={2} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
