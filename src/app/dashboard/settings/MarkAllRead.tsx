"use client";

import { markNotificationsRead } from "@/app/actions/settings";
import { useAction } from "@/components/useAction";

export function MarkAllRead() {
  const { run, pending } = useAction();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => markNotificationsRead().then(() => undefined), { failure: "Couldn't mark them read" })}
      className="text-xs font-semibold text-ink/65 hover:text-ink disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-md px-1"
    >
      {pending ? "Marking…" : "Mark all read"}
    </button>
  );
}
