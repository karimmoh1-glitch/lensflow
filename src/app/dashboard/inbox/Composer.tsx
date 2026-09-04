"use client";

import { useState, useTransition } from "react";
import { Sparkles, RotateCcw } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { generateDraftAction, sendReplyAction } from "@/app/actions/inbox";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toaster";
import { EntitlementNotice } from "@/components/UpgradePrompt";

export function Composer({ conversationId }: { conversationId: string }) {
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
        toast({ tone: "signal", title: "Saved, not delivered", body: "This channel isn't connected on this deployment yet, so nothing was sent. Connect it in Settings → Connections.", ttl: 7000 });
      } else {
        toast({ tone: "outcome", title: "Sent" });
      }
      setBody("");
      setWasAiDrafted(false);
      router.refresh();
    });
  }

  return (
    <div className="border-t border-border bg-white px-6 py-4">
      <Textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setWasAiDrafted(false);
        }}
        placeholder="Write a reply, or let AI draft one…"
        rows={3}
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
        <Button size="sm" onClick={send} disabled={!body.trim() || pending}>
          Send
        </Button>
      </div>
    </div>
  );
}
