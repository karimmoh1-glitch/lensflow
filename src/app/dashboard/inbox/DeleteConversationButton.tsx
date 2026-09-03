"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2, Check, X } from "lucide-react";
import { deleteConversation } from "@/app/actions/inbox";
import { cn } from "@/lib/utils";

/**
 * Two look-and-feel variants of the same action: a small icon on each Inbox row
 * (click reveals an inline confirm/cancel, replacing the icon), and a labeled button
 * for the open thread's header. Both call the same server action. Self-contained
 * rather than taking an onDeleted callback — this renders from a Server Component
 * (the Inbox page), which can't hand a client-side function down as a prop, so it
 * figures out for itself whether the conversation it just deleted was the one open in
 * the URL and clears the selection if so, instead of leaving a stale ?c= pointing at
 * something no longer in the list.
 */
export function DeleteConversationButton({
  conversationId,
  variant = "icon",
}: {
  conversationId: string;
  variant?: "icon" | "labeled";
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const searchParams = useSearchParams();

  function stop(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function doDelete() {
    startTransition(async () => {
      await deleteConversation(conversationId);
      if (searchParams.get("c") === conversationId) {
        const params = new URLSearchParams(searchParams);
        params.delete("c");
        const qs = params.toString();
        router.push(qs ? `/dashboard/inbox?${qs}` : "/dashboard/inbox");
      } else {
        router.refresh();
      }
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1 shrink-0" onClick={stop}>
        <span className="text-xs text-ink/65 mr-0.5">Delete?</span>
        <button
          disabled={pending}
          onClick={(e) => {
            stop(e);
            doDelete();
          }}
          aria-label="Confirm delete"
          className="w-6 h-6 flex items-center justify-center rounded-md text-danger hover:bg-danger/10"
        >
          <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
        <button
          disabled={pending}
          onClick={(e) => {
            stop(e);
            setConfirming(false);
          }}
          aria-label="Cancel"
          className="w-6 h-6 flex items-center justify-center rounded-md text-ink/60 hover:bg-black/[0.05]"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  if (variant === "labeled") {
    return (
      <button
        onClick={(e) => {
          stop(e);
          setConfirming(true);
        }}
        className="text-xs text-ink/60 hover:text-danger transition-colors flex items-center gap-1"
      >
        <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
        Delete conversation
      </button>
    );
  }

  return (
    <button
      onClick={(e) => {
        stop(e);
        setConfirming(true);
      }}
      aria-label="Delete conversation"
      className={cn("w-6 h-6 flex items-center justify-center rounded-md text-ink/25 hover:text-danger hover:bg-danger/10 shrink-0 transition-colors")}
    >
      <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
    </button>
  );
}
