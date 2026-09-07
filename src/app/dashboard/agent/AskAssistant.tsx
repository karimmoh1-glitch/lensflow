"use client";

import { useState, useTransition } from "react";
import { Sparkles, ArrowUp } from "lucide-react";
import { askCopilot } from "@/app/actions/copilot";
import { WorkingDots } from "@/components/ui";
import { cn } from "@/lib/utils";

const PROMPTS = ["Who is waiting on me right now?", "What's on my calendar this week?", "Which inquiries are going cold?", "Is anything not confirmed yet?"];

/**
 * Ask the assistant about your own business. Every answer is grounded in the workspace's
 * records (conversations, bookings, calendar, people) gathered on the server; the model
 * cannot take actions and the answer says so when it is rules-based.
 */
export function AskAssistant() {
  const [q, setQ] = useState("");
  const [history, setHistory] = useState<Array<{ q: string; a: string }>>([]);
  const [pending, start] = useTransition();

  function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    setQ("");
    start(async () => {
      const a = await askCopilot(text).catch(() => "Couldn't answer just now. Nothing was changed — try again.");
      setHistory((h) => [...h.slice(-5), { q: text, a }]);
    });
  }

  return (
    <section aria-label="Ask the assistant" className="rounded-[22px] border border-border bg-white overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-signal-text">Ask</div>
        <form
          className="mt-2 flex items-center gap-2 rounded-2xl border border-ink/[0.14] bg-white pl-3 pr-1.5 h-12 focus-within:border-ink/30 focus-within:shadow-[0_0_0_4px_rgba(16,17,20,0.05)] transition-[border-color,box-shadow]"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <Sparkles className="w-4 h-4 text-signal-text shrink-0" strokeWidth={2} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your inbox, calendar or customers…" aria-label="Ask the assistant" maxLength={500} className="flex-1 bg-transparent text-[16px] md:text-sm text-ink placeholder:text-ink/65 outline-none min-w-0" />
          <button type="submit" disabled={!q.trim() || pending} aria-label="Ask" className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50", q.trim() && !pending ? "bg-ink hover:bg-black" : "bg-ink/25")}>
            {pending ? <WorkingDots /> : <ArrowUp className="w-4 h-4" strokeWidth={2.5} aria-hidden />}
          </button>
        </form>
        {history.length === 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {PROMPTS.map((p) => (
              <li key={p}><button type="button" onClick={() => ask(p)} disabled={pending} className="h-8 px-3 rounded-full border border-border text-xs font-semibold text-ink/70 hover:text-ink hover:border-ink/25 transition-colors disabled:opacity-50">{p}</button></li>
            ))}
          </ul>
        )}
      </div>
      {history.length > 0 && (
        <ol className="border-t border-border divide-y divide-border" aria-live="polite">
          {history.map((h, i) => (
            <li key={i} className="px-5 py-3.5 dt-msg-in">
              <div className="text-xs font-semibold text-ink/70">{h.q}</div>
              <p className="mt-1 text-sm text-ink leading-relaxed whitespace-pre-wrap">{h.a}</p>
            </li>
          ))}
        </ol>
      )}
      <p className="px-5 py-2.5 border-t border-border text-[11px] text-ink/65">Answers come from your own records. The assistant never takes an action from here.</p>
    </section>
  );
}
