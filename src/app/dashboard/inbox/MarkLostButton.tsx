"use client";

import { markLeadLost } from "@/app/actions/inbox";
import { useAction } from "@/components/useAction";

export function MarkLostButton({ leadId }: { leadId: string }) {
  const { run, pending } = useAction();

  return (
    <button
      disabled={pending}
      onClick={() => run(() => markLeadLost(leadId), { failure: "Couldn't close that lead" })}
      className="text-xs text-ink/65 hover:text-danger transition-colors"
    >
      Mark as lost
    </button>
  );
}
