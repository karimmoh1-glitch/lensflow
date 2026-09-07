"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMembershipStatus } from "@/app/actions/team";
import { useToast } from "@/components/Toaster";
import type { MembershipStatus, Role } from "@prisma/client";

export function MemberActions({ membershipId, role, status }: { membershipId: string; role: Role; status: MembershipStatus }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  if (role === "OWNER") return null;

  function toggle() {
    startTransition(async () => {
      try {
        await setMembershipStatus(membershipId, status === "SUSPENDED");
        router.refresh();
      } catch (err) {
        toast({ tone: "signal", title: "Couldn't change that", body: err instanceof Error ? err.message : undefined });
      }
    });
  }

  return (
    <button type="button" onClick={toggle} disabled={pending} className="text-xs font-medium text-ink/60 hover:text-danger shrink-0 disabled:opacity-50 min-h-[44px] sm:min-h-0">
      {status === "SUSPENDED" ? "Reactivate" : "Deactivate"}
    </button>
  );
}
