"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Textarea, Button, EmptyState } from "@/components/ui";
import { sendPortalMessage } from "@/app/actions/portal";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Msg = { id: string; direction: "INBOUND" | "OUTBOUND"; body: string; createdAt: string };

export function PortalMessages({ conversationId, messages }: { conversationId: string | null; messages: Msg[] }) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!conversationId) {
    return <EmptyState title="No messages yet" description="When your photographer starts a conversation, it'll show up here." />;
  }

  function send() {
    if (!body.trim() || !conversationId) return;
    startTransition(async () => {
      await sendPortalMessage(conversationId, body);
      setBody("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin">
          {messages.map((m) => (
            <div key={m.id} className={cn("max-w-[85%]", m.direction === "INBOUND" ? "ml-auto" : "")}>
              <div className={cn("rounded-2xl px-3.5 py-2 text-sm", m.direction === "INBOUND" ? "bg-ink text-white" : "bg-black/[0.05] text-ink")}>
                {m.body}
              </div>
              <div className={cn("text-[11px] text-ink/35 mt-1", m.direction === "INBOUND" ? "text-right" : "")}>
                {format(new Date(m.createdAt), "MMM d, h:mm a")}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2 border-t border-border">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Write a message…" />
          <Button size="sm" onClick={send} disabled={!body.trim() || pending}>
            Send
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
