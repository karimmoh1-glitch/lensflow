"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPartnerConversationAccess } from "@/app/actions/team";

export function ConversationAccessToggle({ membershipId, canViewAll }: { membershipId: string; canViewAll: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <label className="flex items-center gap-1.5 text-xs text-ink/65 shrink-0 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={canViewAll}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(async () => {
            await setPartnerConversationAccess(membershipId, next);
            router.refresh();
          });
        }}
        className="accent-ink"
      />
      All conversations
    </label>
  );
}
