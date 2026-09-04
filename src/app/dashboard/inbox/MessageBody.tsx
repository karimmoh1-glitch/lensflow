"use client";

import { useState } from "react";
import { splitMessage } from "@/lib/cleanMessage";
import { cn } from "@/lib/utils";

/**
 * A message shows what the person wrote now. The quoted history and signature are still
 * there — one click away — but they never compete with the new sentence.
 */
export function MessageBody({ body, outbound }: { body: string; outbound: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const split = splitMessage(body);
  const hasMore = Boolean(split.quoted || split.signature);
  return (
    <div>
      <div className="whitespace-pre-wrap break-words">{showAll ? body : split.text}</div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-[11px] font-semibold rounded-md px-1.5 py-0.5 -ml-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            outbound ? "text-white/60 hover:text-white hover:bg-white/10" : "text-ink/50 hover:text-ink hover:bg-black/[0.05]"
          )}
        >
          <span aria-hidden>{showAll ? "↑" : "↳"}</span>
          {showAll ? "Hide original" : split.quoted ? "Previous conversation" : "Show original"}
        </button>
      )}
    </div>
  );
}
