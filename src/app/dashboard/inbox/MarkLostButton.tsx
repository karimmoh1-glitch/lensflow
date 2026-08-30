"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markLeadLost } from "@/app/actions/inbox";

export function MarkLostButton({ leadId }: { leadId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markLeadLost(leadId);
          router.refresh();
        })
      }
      className="text-xs text-ink/40 hover:text-danger transition-colors"
    >
      Mark as lost
    </button>
  );
}
