"use client";

import { useState, useTransition } from "react";
import { Sparkles, RotateCcw } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { generateDraftAction, sendReplyAction } from "@/app/actions/inbox";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toaster";
import { EntitlementNotice } from "@/components/UpgradePrompt";

/**
 * The WhatsApp 24-hour customer service window, told to the person *before* they write.
 * The server refuses the send either way; this only means they find out first rather than
 * after composing a reply that Meta will not carry.
 */
export type WindowNotice = { open: false; text: string } | { open: true; endsIn: string } | null;

export function Composer({ conversationId, windowNotice = null }: { conversationId: string; windowNotice?: WindowNotice }) {
  const [body, setBody] = useState("");
  const [wasAiDrafted, setWasAiDrafted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  function draft() {
    setDrafting(true);
    setError(null);
    startTransition(async () => {
      try {
        const res = await generateDraftAction(conversationId);
        if (res.error) {
          setError(res.error);
          return;
        }
        setBody(res.text ?? "");
        setWasAiDrafted(true);
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
        // The exact reason from the server — the 24-hour WhatsApp window, a connection that
        // needs renewing, a channel that was never connected. Never a generic guess.
        toast({ tone: "signal", title: "Saved, not delivered", body: result.reason ?? "This channel isn't connected yet, so nothing was sent. Connect it in Settings → Integrations.", ttl: 9000 });
      } else {
        toast({ tone: "outcome", title: "Sent" });
      }
      setBody("");
      setWasAiDrafted(false);
      router.refresh();
    });
  }

  const closed = windowNotice !== null && windowNotice.open === false;

  return (
    <div className="sticky bottom-0 border-t border-border bg-white px-4 md:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:py-4">
      {closed && (
        <p role="status" className="mb-2.5 rounded-xl border border-warning/40 bg-warning-soft/50 px-3 py-2 text-[12px] leading-snug text-ink/80">
          {windowNotice.text}
        </p>
      )}
      {windowNotice?.open && (
        <p className="mb-2 text-[11px] text-ink/45">WhatsApp reply window closes in {windowNotice.endsIn}.</p>
      )}
      <Textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setWasAiDrafted(false);
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
        }}
        placeholder={closed ? "Write a note — it will be saved to the thread, not delivered…" : "Write a reply, or let AI draft one…"}
        rows={3}
        aria-label="Reply"
        className="text-[16px] md:text-sm"
      />
      {error && <div className="mt-2"><EntitlementNotice message={error} /></div>}
      <div className="flex items-center justify-between mt-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={draft}
          disabled={drafting || pending}
          className="border-signal/30 text-signal-text hover:bg-signal-soft hover:border-signal/50"
        >
          {wasAiDrafted ? <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} /> : <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />}
          {drafting ? "Drafting…" : wasAiDrafted ? "Regenerate" : "Draft with AI"}
        </Button>
        <Button size="sm" onClick={send} disabled={!body.trim() || pending} loading={pending && !drafting} loadingLabel={closed ? "Saving" : "Sending"} className="min-w-[5.5rem]">
          {closed ? "Save to thread" : "Send"}
        </Button>
      </div>
    </div>
  );
}
