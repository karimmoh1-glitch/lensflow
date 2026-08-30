"use client";

import { useState, useTransition } from "react";
import { Sparkles, RotateCcw } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { generateDraftAction, sendReplyAction } from "@/app/actions/inbox";
import { useRouter } from "next/navigation";

export function Composer({ conversationId }: { conversationId: string }) {
  const [body, setBody] = useState("");
  const [wasAiDrafted, setWasAiDrafted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [drafting, setDrafting] = useState(false);
  const router = useRouter();

  function draft() {
    setDrafting(true);
    startTransition(async () => {
      try {
        const text = await generateDraftAction(conversationId);
        setBody(text);
        setWasAiDrafted(true);
      } finally {
        setDrafting(false);
      }
    });
  }

  function send() {
    if (!body.trim()) return;
    startTransition(async () => {
      await sendReplyAction(conversationId, body, wasAiDrafted);
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
      <div className="flex items-center justify-between mt-2.5">
        <Button variant="outline" size="sm" onClick={draft} disabled={drafting || pending}>
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
