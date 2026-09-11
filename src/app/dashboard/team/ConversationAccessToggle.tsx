"use client";

import { useState } from "react";
import { setPartnerConversationAccess } from "@/app/actions/team";
import { useAction } from "@/components/useAction";

export function ConversationAccessToggle({ membershipId, canViewAll }: { membershipId: string; canViewAll: boolean }) {
  const [checked, setChecked] = useState(canViewAll);
  const { run, pending } = useAction();

  return (
    <label className="flex items-center gap-1.5 text-xs text-ink/70 shrink-0 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setChecked(next);
          // A refused change must not leave the box ticked on access nobody was granted.
          run(() => setPartnerConversationAccess(membershipId, next), { failure: "Couldn't change access", onError: () => setChecked(!next) });
        }}
        className="accent-ink"
      />
      All conversations
    </label>
  );
}
