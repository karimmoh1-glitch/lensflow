"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toaster";

/**
 * Running a server action from a control that has no form around it. Every one of these
 * used to call the action bare inside a transition: when the action threw — unauthorized,
 * not found, wrong tenant — the rejection went nowhere, router.refresh() never ran, and the
 * control sat there showing a change that was never saved.
 *
 * `run` reports the failure and tells the caller, so an optimistic control can put itself
 * back. A thrown Error's message is written for people; anything else gets a plain sentence.
 */
export function useAction(): { run: (fn: () => Promise<void>, opts?: { failure?: string; success?: string; onError?: () => void }) => void; pending: boolean } {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const run = (fn: () => Promise<void>, opts: { failure?: string; success?: string; onError?: () => void } = {}) =>
    start(async () => {
      try {
        await fn();
        if (opts.success) toast({ tone: "outcome", title: opts.success });
        router.refresh();
      } catch (err) {
        const message = err instanceof Error && err.message && err.message !== "unauthorized" ? err.message : "You may not have permission, or it no longer exists.";
        toast({ tone: "signal", title: opts.failure ?? "That didn't save", body: message });
        opts.onError?.();
        router.refresh();
      }
    });
  return { run, pending };
}
