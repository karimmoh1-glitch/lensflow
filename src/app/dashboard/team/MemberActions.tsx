"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMembershipStatus } from "@/app/actions/team";
import type { MembershipStatus, Role } from "@prisma/client";

export function MemberActions({ membershipId, role, status }: { membershipId: string; role: Role; status: MembershipStatus }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (role === "OWNER") return null;

  function toggle() {
    startTransition(async () => {
      try {
        await setMembershipStatus(membershipId, status === "SUSPENDED");
        router.refresh();
      } catch {
        // The action already prevents self-deactivation server-side; nothing more to show here.
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className="text-xs font-medium text-ink/40 hover:text-danger shrink-0 disabled:opacity-50"
    >
      {status === "SUSPENDED" ? "Reactivate" : "Deactivate"}
    </button>
  );
}
