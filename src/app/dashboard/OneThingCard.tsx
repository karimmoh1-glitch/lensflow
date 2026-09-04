"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markLeadHandled } from "@/app/actions/leads";
import { useToast } from "@/components/Toaster";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The signature card. One person, why, and two ways through: Reply (the real thing) or
 * Done (you handled it elsewhere). Done settles the card — it sinks and fades in the
 * outcome color — and, because the page re-renders through the app's template, the next
 * priority rises into its place. Nothing is faked: Done writes respondedAt, exactly what
 * a sent reply writes.
 */
export function OneThingCard({
  leadId,
  name,
  href,
  waiting,
  detail,
  more,
}: {
  leadId: string;
  name: string;
  href: string;
  waiting: string | null;
  detail: string;
  more: number;
}) {
  const [state, setState] = useState<"idle" | "settling" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const first = name.split(" ")[0] || "this lead";

  function done() {
    setState("settling");
    startTransition(async () => {
      const res = await markLeadHandled(leadId);
      if (res.error) {
        setState("error");
        return;
      }
      toast({ tone: "outcome", title: `${first} marked as handled`, body: "The next thing is up." });
      // let the settle finish before the next thing rises
      await new Promise((r) => setTimeout(r, 420));
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-2xl border px-4 sm:px-5 py-4 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        state === "settling"
          ? "border-success/40 bg-success-soft/60 translate-y-1 scale-[0.985] opacity-70"
          : "border-accent/30 bg-gradient-to-br from-accent-soft/70 to-white hover:border-accent/50 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_rgba(240,82,77,0.6)]"
      )}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
      <span className={cn("w-11 h-11 rounded-full text-white flex items-center justify-center text-sm font-extrabold shrink-0 transition-colors duration-500", state === "settling" ? "bg-success" : "bg-accent")}>
        {state === "settling" ? "✓" : initials(name || "?")}
      </span>
      <Link href={href} className="min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-lg">
        <span className="block text-base font-extrabold text-ink tracking-tight leading-tight">
          {state === "settling" ? `${first} — handled.` : `Reply to ${first}.`}
          {state !== "settling" && waiting && <span className="text-ink/60 font-semibold"> {waiting}</span>}
        </span>
        <span className="block text-sm text-ink/60 mt-0.5">
          {state === "settling" ? "The next thing is on its way up." : detail}
          {state !== "settling" && more > 0 && ` · ${more} more waiting`}
        </span>
      </Link>
      </div>
      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        <button
          type="button"
          onClick={done}
          disabled={pending || state === "settling"}
          className="h-10 px-3.5 rounded-full text-xs font-bold text-ink/55 hover:text-ink hover:bg-black/[0.05] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50"
          aria-label={`Mark ${first} as handled`}
        >
          Done
        </button>
        <Link href={href} className="inline-flex items-center h-10 px-4 rounded-full bg-ink text-white text-sm font-extrabold transition-transform duration-150 group-hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2">
          Reply
        </Link>
      </div>
      {state === "error" && (
        <p role="alert" className="absolute -bottom-6 left-5 text-xs font-medium text-danger-text">
          Couldn&rsquo;t mark that. Nothing changed — try again.
        </p>
      )}
    </div>
  );
}
