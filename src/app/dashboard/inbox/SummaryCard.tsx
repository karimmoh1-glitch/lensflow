"use client";

import { PaywallTrigger } from "@/components/Paywall";

import { useEffect, useState, useTransition } from "react";
import { AlignLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { summarizeConversation } from "@/app/actions/conversations";
import type { ConversationSummary } from "@/lib/summarize";
import { WorkingDots } from "@/components/ui";

/**
 * The summary card in the context rail. Shows the cached summary when there is one,
 * generates on demand (or automatically when opened via a row's Summarize), and labels
 * where the sentence came from — the model, or the records.
 */
export function SummaryCard({ conversationId, initial, autoRun }: { conversationId: string; initial: ConversationSummary | null; autoRun: boolean }) {
  const [summary, setSummary] = useState<ConversationSummary | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (force: boolean) =>
    start(async () => {
      setError(null);
      const r = await summarizeConversation(conversationId, { force });
      if (r.error) setError(r.error);
      else if (r.summary) setSummary(r.summary);
    });
  useEffect(() => {
    if (autoRun && !initial) run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, autoRun]);
  useEffect(() => setSummary(initial), [initial, conversationId]);

  return (
    <div className={cn(summary || pending || error ? "rounded-xl border border-border bg-white px-4 py-3.5" : "")}>
      <div className="flex items-center justify-between gap-2">
        {summary || pending || error ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-ink/60">
            <AlignLeft className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            Summary
          </div>
        ) : (
          <button type="button" onClick={() => run(true)} className="w-full flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-white text-13 font-medium text-ink/75 hover:text-ink hover:border-ink/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">
            <AlignLeft className="w-3.5 h-3.5 text-ink/60" strokeWidth={2} aria-hidden />
            Summarize this conversation
          </button>
        )}
        {(summary || pending) && (
          <button type="button" onClick={() => run(true)} disabled={pending} className="text-xs font-medium text-ink/60 hover:text-ink rounded-md px-1.5 h-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">
            {pending ? <WorkingDots /> : "Refresh"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}
      {summary && (
        <div className={cn("mt-2 dt-swap", pending && "opacity-60")}>
          <p className="text-sm text-ink leading-snug">{summary.summary}</p>
          {summary.details.length > 0 && (
            <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {summary.details.map((d) => (
                <div key={d.label} className="contents">
                  <dt className="text-ink/65">{d.label}</dt>
                  <dd className="font-medium text-ink truncate">{d.value}</dd>
                </div>
              ))}
              <div className="contents">
                <dt className="text-ink/65">Status</dt>
                <dd className="font-medium text-ink">{summary.status}</dd>
              </div>
            </dl>
          )}
          <div className="mt-2.5 pt-2.5 border-t border-border">
            <div className="text-13 font-semibold text-ink/65">Suggested next step</div>
            <div className="text-sm font-semibold text-ink mt-0.5">{summary.nextStep}</div>
          </div>
          <div className="mt-2 text-2xs text-ink/65">{summary.source === "ai" ? "Sentence by AI, details from the messages" : <>From the messages — <PaywallTrigger feature="ai_summary" source="summary-card" variant="link" className="text-2xs">AI summaries are part of Pro →</PaywallTrigger></>}</div>
        </div>
      )}
    </div>
  );
}
