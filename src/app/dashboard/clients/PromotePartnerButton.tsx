"use client";

import { useState } from "react";
import { promoteToPartner } from "@/app/actions/joinRequests";
import { Button } from "@/components/ui";
import { useAction } from "@/components/useAction";

export function PromotePartnerButton({ membershipId, name }: { membershipId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const { run, pending } = useAction();

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
            run(
              async () => {
                await promoteToPartner(membershipId);
                setConfirming(false);
              },
              { failure: `Couldn't make ${name} a partner`, success: `${name} is now a partner` }
            )
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
