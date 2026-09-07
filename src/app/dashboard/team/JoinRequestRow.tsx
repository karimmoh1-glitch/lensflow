"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToJoinRequest } from "@/app/actions/joinRequests";
import { Button } from "@/components/ui";
import { initials } from "@/lib/utils";

export function JoinRequestRow({ id, name, email }: { id: string; name: string; email: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function respond(accept: boolean) {
    startTransition(async () => {
      await respondToJoinRequest(id, accept);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-xs font-semibold shrink-0">
        {initials(name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{name}</div>
        <div className="text-xs text-ink/65 truncate">{email} · requested to join</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => respond(false)}>
          Decline
        </Button>
        <Button size="sm" disabled={pending} onClick={() => respond(true)}>
          Accept
        </Button>
      </div>
    </div>
  );
}
