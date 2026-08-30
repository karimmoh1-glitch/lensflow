"use client";

import { useState, useTransition } from "react";
import { Button, Input, Card, CardBody } from "@/components/ui";
import { askCopilot } from "@/app/actions/copilot";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["Who owes me money?", "Which leads are hot?", "What do I need to do today?", "How much have I collected this month?"];

type Turn = { role: "user" | "assistant"; text: string };

export function CopilotChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, startTransition] = useTransition();

  function ask(q: string) {
    if (!q.trim() || pending) return;
    setTurns((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    startTransition(async () => {
      const answer = await askCopilot(q);
      setTurns((prev) => [...prev, { role: "assistant", text: answer }]);
    });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 mt-4">
      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3 mb-4">
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)} className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-black/5">
                {s}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn("max-w-md", t.role === "user" ? "ml-auto" : "")}>
            <Card className={cn(t.role === "user" ? "bg-ink text-white border-none" : "")}>
              <CardBody className="py-2.5 px-3.5 text-sm whitespace-pre-wrap">{t.text}</CardBody>
            </Card>
          </div>
        ))}
        {pending && <div className="text-xs text-ink/40">Thinking…</div>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex gap-2"
      >
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about your business…" />
        <Button type="submit" disabled={pending}>
          Ask
        </Button>
      </form>
    </div>
  );
}
