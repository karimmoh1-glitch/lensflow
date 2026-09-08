"use client";

import { useState, useTransition } from "react";
import { Sparkles, X } from "lucide-react";
import { summarizeMessage } from "@/app/actions/messages";
import { cn } from "@/lib/utils";

/**
 * The "Summarize" affordance on one message. On a pointer device it appears when the
 * message is hovered or anything in it has focus; on a touch device it is always there,
 * small and quiet, because there is no hover. Once written the summary sits under the
 * message and can be tucked away; a second click is answered from the cache.
 */
export function MessageSummary({ messageId, outbound, initial, initialSource }: { messageId: string; outbound: boolean; initial: string | null; initialSource: "ai" | "rules" | null }) {
  const [summary, setSummary] = useState<string | null>(initial);
  const [source, setSource] = useState<"ai" | "rules" | null>(initialSource);
  const [open, setOpen] = useState(Boolean(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () => {
    setError(null);
    if (summary) { setOpen((v) => !v); return; }
    start(async () => {
      const res = await summarizeMessage(messageId);
      if (res.error || !res.summary) { setError(res.error ?? "Couldn't summarize that just now."); return; }
      setSummary(res.summary);
      setSource(res.source ?? "rules");
      setOpen(true);
    });
  };

  const tone = outbound ? "text-white/70 hover:text-white hover:bg-white/10" : "text-ink/65 hover:text-ink hover:bg-black/[0.06]";
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        aria-expanded={summary ? open : undefined}
        aria-label={summary ? (open ? "Hide summary" : "Show summary") : "Summarize this message"}
        className={cn(
          "inline-flex items-center gap-1 h-6 px-1.5 -ml-1.5 rounded-md text-[11px] font-semibold transition-opacity duration-150 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:px-2.5 [@media(pointer:coarse)]:text-[12px]",
          // Always present for touch; on a hover-capable device it fades in with the message.
          "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/msg:opacity-100 [@media(hover:hover)]:group-focus-within/msg:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100",
          summary && open && "[@media(hover:hover)]:opacity-100",
          tone,
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60"
        )}
      >
        <Sparkles className="w-3 h-3" strokeWidth={2.5} aria-hidden />
        {pending ? "Summarizing…" : summary ? (open ? "Hide summary" : "Summary") : "Summarize"}
      </button>
      {error && <p role="alert" className={cn("mt-1 text-[12px]", outbound ? "text-white/80" : "text-ink/70")}>{error}</p>}
      {summary && open && (
        <div role="status" className={cn("mt-1 rounded-xl px-3 py-2 text-[13px] leading-snug", outbound ? "bg-white/10 text-white" : "bg-white border border-border text-ink")}>
          <div className="flex items-start gap-2">
            <p className="flex-1">{summary}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Hide summary" className={cn("shrink-0 w-5 h-5 [@media(pointer:coarse)]:w-9 [@media(pointer:coarse)]:h-9 rounded-md inline-flex items-center justify-center", tone)}><X className="w-3 h-3" strokeWidth={2.5} aria-hidden /></button>
          </div>
          <p className={cn("mt-1 text-[10px] font-bold uppercase tracking-[0.12em]", outbound ? "text-white/70" : "text-ink/65")}>{source === "ai" ? "Written by the model from this message" : "From the message, by rules"}</p>
        </div>
      )}
    </div>
  );
}
