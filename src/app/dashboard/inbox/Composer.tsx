"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles, RotateCcw, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui";
import { generateDraftAction, sendReplyAction } from "@/app/actions/inbox";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toaster";
import { EntitlementNotice } from "@/components/UpgradePrompt";
import { usePaywall } from "@/components/Paywall";
import { cn } from "@/lib/utils";

/**
 * The WhatsApp 24-hour customer service window, told to the person *before* they write.
 * The server refuses the send either way; this only means they find out first rather than
 * after composing a reply that Meta will not carry.
 */
export type WindowNotice = { open: false; text: string } | { open: true; endsIn: string } | null;

export function Composer({ conversationId, windowNotice = null, channelLabel = "this channel" }: { conversationId: string; windowNotice?: WindowNotice; channelLabel?: string }) {
  const [body, setBody] = useState("");
  const [wasAiDrafted, setWasAiDrafted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paywall = usePaywall();
  const [sentPulse, setSentPulse] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const router = useRouter();

  // Grow with the text, up to about six lines; never a scrollbar for a two-line reply.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [body]);

  function draft() {
    setDrafting(true);
    setError(null);
    startTransition(async () => {
      try {
        const res = await generateDraftAction(conversationId);
        if (res.error) {
          setError(res.error);
          if (/daythread pro/i.test(res.error)) paywall?.open("ai_draft", "composer-draft");
          return;
        }
        setBody(res.text ?? "");
        setWasAiDrafted(true);
        ref.current?.focus();
      } catch {
        setError("Couldn't draft a reply just now. Your conversation is untouched — try again.");
      } finally {
        setDrafting(false);
      }
    });
  }

  function send() {
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await sendReplyAction(conversationId, body, wasAiDrafted);
      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }
      if (result.simulated) {
        toast({ tone: "signal", title: "Saved, not delivered", body: result.reason ?? "This channel isn't connected yet, so nothing was sent. Connect it under Settings → Channels.", ttl: 9000 });
      } else {
        toast({ tone: "outcome", title: "Sent" });
      }
      setBody("");
      setWasAiDrafted(false);
      setSentPulse(true);
      setTimeout(() => setSentPulse(false), 500);
      router.refresh();
    });
  }

  const closed = windowNotice !== null && windowNotice.open === false;
  const canSend = body.trim().length > 0 && !pending;

  return (
    <div className="sticky bottom-0 border-t border-border bg-white/95 backdrop-blur px-3 md:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:py-4">
      {closed && (
        <p role="status" className="mb-2.5 rounded-xl border border-warning/40 bg-warning-soft/50 px-3 py-2 text-[12px] leading-snug text-ink/80">
          {windowNotice.text}
        </p>
      )}
      {windowNotice?.open && <p className="mb-2 text-[11px] text-ink/65">WhatsApp reply window closes in {windowNotice.endsIn}.</p>}
      <div className={cn("rounded-[20px] border bg-white transition-[border-color,box-shadow] duration-150 focus-within:border-ink/30 focus-within:shadow-[0_0_0_4px_rgba(16,17,20,0.05)]", error ? "border-danger/40" : "border-ink/[0.14]", sentPulse && "dt-confirm")}>
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setWasAiDrafted(false);
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
          }}
          placeholder={closed ? "Write a note — it will be saved to the thread, not delivered…" : `Reply on ${channelLabel}…`}
          rows={1}
          aria-label="Reply"
          className="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[16px] md:text-sm text-ink placeholder:text-ink/65 outline-none min-h-[44px]"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <button
            type="button"
            onClick={draft}
            disabled={drafting || pending}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-semibold text-signal-text hover:bg-signal-soft transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            {wasAiDrafted ? <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /> : <Sparkles className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />}
            {drafting ? "Drafting…" : wasAiDrafted ? "Regenerate" : "Draft with AI"}
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden md:inline text-[11px] text-ink/65" aria-hidden>⌘↵</span>
            <Button size="sm" onClick={send} disabled={!canSend} loading={pending && !drafting} loadingLabel={closed ? "Saving" : "Sending"} aria-label={closed ? "Save to thread" : "Send"} className={cn("min-w-[2.25rem] px-3", !canSend && "bg-ink/25")}>
              {closed ? "Save" : <><span className="hidden sm:inline">Send</span><ArrowUp className="w-4 h-4 sm:ml-0.5" strokeWidth={2.5} aria-hidden /></>}
            </Button>
          </div>
        </div>
      </div>
      {error && <div className="mt-2"><EntitlementNotice message={error} /></div>}
    </div>
  );
}
