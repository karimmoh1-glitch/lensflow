"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { promoteToPartner } from "@/app/actions/joinRequests";
import { Button } from "@/components/ui";

export function PromotePartnerButton({ membershipId, name }: { membershipId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (confirming) {
    return (
      <div
        className="flex items-center gap-2 shrink-0"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <span className="text-xs text-ink/70">Make {name} a partner?</span>
        <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await promoteToPartner(membershipId);
              router.refresh();
            })
          }
        >
          Confirm
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="shrink-0"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setConfirming(true);
      }}
    >
      Promote to Partner
    </Button>
  );
}
