"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/actions/settings";

export function MarkAllRead() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await markNotificationsRead(); router.refresh(); })}
      className="text-xs font-semibold text-ink/60 hover:text-ink disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-md px-1"
    >
      {pending ? "Marking…" : "Mark all read"}
    </button>
  );
}
