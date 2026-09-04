"use client";

import { useEffect, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
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
    <div className="rounded-2xl border border-signal/20 bg-signal-soft/30 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-signal-text">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
          Summary
        </div>
        <button type="button" onClick={() => run(true)} disabled={pending} className="text-[11px] font-semibold text-ink/55 hover:text-ink rounded-md px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
          {pending ? <WorkingDots /> : summary ? "Refresh" : "Summarize"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}
      {!summary && !pending && !error && <p className="mt-2 text-xs text-ink/60">One sentence, the key details, and the next step — from the messages themselves.</p>}
      {summary && (
        <div className={cn("mt-2 dt-swap", pending && "opacity-60")}>
          <p className="text-sm text-ink leading-snug">{summary.summary}</p>
          {summary.details.length > 0 && (
            <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {summary.details.map((d) => (
                <div key={d.label} className="contents">
                  <dt className="text-ink/50">{d.label}</dt>
                  <dd className="font-medium text-ink truncate">{d.value}</dd>
                </div>
              ))}
              <div className="contents">
                <dt className="text-ink/50">Status</dt>
                <dd className="font-medium text-ink">{summary.status}</dd>
              </div>
            </dl>
          )}
          <div className="mt-2.5 pt-2.5 border-t border-signal/15">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45">Suggested next step</div>
            <div className="text-sm font-semibold text-ink mt-0.5">{summary.nextStep}</div>
          </div>
          <div className="mt-2 text-[10px] text-ink/40">{summary.source === "ai" ? "Sentence by AI, details from your records" : "From your records — no AI key configured"}</div>
        </div>
      )}
    </div>
  );
}
