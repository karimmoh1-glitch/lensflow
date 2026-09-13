"use client";

import { markLeadLost } from "@/app/actions/inbox";
import { useAction } from "@/components/useAction";

export function MarkLostButton({ leadId }: { leadId: string }) {
  const { run, pending } = useAction();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => markLeadLost(leadId), { failure: "Couldn't close that lead" })}
      className="inline-flex items-center min-h-[32px] text-xs text-ink/65 hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 rounded"
    >
      Mark as lost
    </button>
  );
}
