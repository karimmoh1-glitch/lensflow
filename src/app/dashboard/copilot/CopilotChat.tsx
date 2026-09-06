"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, ArrowUp } from "lucide-react";
import { askCopilot } from "@/app/actions/copilot";
import { cn } from "@/lib/utils";
import { WorkingDots } from "@/components/ui";

type Turn = { role: "user" | "assistant"; text: string; failed?: boolean };

/**
 * A conversation, not a form: the thread scrolls, the composer stays pinned above the tab
 * bar on phones, a question can be retried if the server failed, and the Free allowance is
 * visible before it runs out. Answers come from the server action, which re-checks the
 * plan and the daily and hourly caps in the database on every call.
 */
export function CopilotChat({ firstName, businessName, planName, daily, usedToday, suggestions }: { firstName: string; businessName: string; planName: string; daily: number | null; usedToday: number; suggestions: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [used, setUsed] = useState(usedToday);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns, pending]);
  const left = daily === null ? null : Math.max(0, daily - used);

  function ask(q: string) {
    const text = q.trim();
    if (!text || pending) return;
    setTurns((prev) => [...prev, { role: "user", text }]);
    setQuestion("");
    startTransition(async () => {
      try {
        const answer = await askCopilot(text);
        setTurns((prev) => [...prev, { role: "assistant", text: answer }]);
        if (!/hourly limit|used today's/.test(answer)) setUsed((u) => u + 1);
      } catch {
        setTurns((prev) => [...prev, { role: "assistant", text: "That didn't go through — the server couldn't answer just now. Nothing was counted against your allowance. Ask again in a moment.", failed: true }]);
      }
    });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-end justify-between gap-4 mb-4 shrink-0">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">Copilot</p>
          <h1 className="mt-1 font-sans font-black text-page-title text-ink tracking-tight">Ask about {businessName}.</h1>
        </div>
        {left !== null && (
          <div className={cn("text-right text-[11px] font-semibold shrink-0", left === 0 ? "text-warning-text" : "text-ink/50")}>
            {left} of {daily} left today
            <div className="text-[10px] font-medium text-ink/40">{planName} · <Link href="/dashboard/billing" className="text-signal-text hover:underline">unlimited on Pro</Link></div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin -mx-1 px-1 pb-4 space-y-3">
        {turns.length === 0 && (
          <div className="rounded-[22px] border border-border bg-white px-5 py-5">
            <p className="text-sm text-ink/70 leading-relaxed">Hi {firstName}. I answer from your real records — conversations, bookings, payments and clients — never from guesses. Try one of these, or ask anything.</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => ask(s)} className="text-[13px] font-medium px-3.5 py-2 rounded-full border border-border bg-paper/70 text-ink/80 hover:bg-signal-soft hover:border-signal/30 hover:text-ink transition-colors active:scale-[0.98]">{s}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn("dt-land max-w-[85%] md:max-w-[75%]", t.role === "user" ? "ml-auto" : "flex items-start gap-2.5")}>
            {t.role === "assistant" && (
              <span className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5", t.failed ? "bg-warning-soft text-warning-text" : "bg-signal-soft text-signal-text")}><Sparkles className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /></span>
            )}
            <div className={cn("rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap", t.role === "user" ? "bg-ink text-white rounded-br-md" : t.failed ? "bg-warning-soft/60 border border-warning/30 text-ink/80 rounded-bl-md" : "bg-white border border-border text-ink rounded-bl-md")}>
              {t.text}
              {t.failed && <button type="button" onClick={() => { const q = [...turns].reverse().find((x) => x.role === "user")?.text; if (q) ask(q); }} className="block mt-2 text-xs font-bold text-signal-text hover:underline">Try again</button>}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex items-center gap-2.5 text-xs text-signal-text">
            <span className="w-7 h-7 rounded-full bg-signal-soft flex items-center justify-center shrink-0"><Sparkles className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /></span>
            <span className="inline-flex items-center gap-2">Reading your records <WorkingDots /></span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(question); }}
        className="shrink-0 pb-3 md:pb-6 pt-2 bg-paper"
      >
        <div className="flex items-end gap-2 rounded-[22px] border border-border bg-white px-3 py-2 shadow-card focus-within:border-signal/50 focus-within:ring-[3px] focus-within:ring-signal/15 transition-[border-color,box-shadow]">
          <textarea
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(question); } }}
            placeholder={left === 0 ? "Today's allowance is used up — back tomorrow, or upgrade." : "Ask about leads, bookings, payments…"}
            rows={1}
            disabled={left === 0}
            aria-label="Your question"
            className="flex-1 resize-none bg-transparent text-[15px] md:text-sm text-ink placeholder:text-ink/35 focus:outline-none py-1.5 max-h-32 disabled:opacity-50"
          />
          <button type="submit" disabled={pending || !question.trim() || left === 0} aria-label="Ask" className="w-9 h-9 rounded-full bg-ink text-white flex items-center justify-center shrink-0 disabled:opacity-30 transition-transform active:scale-95">
            <ArrowUp className="w-4 h-4" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-ink/40">Answers are grounded in your data and can still be wrong. Nothing is sent to anyone.</p>
      </form>
    </div>
  );
}
