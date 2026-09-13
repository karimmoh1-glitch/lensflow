"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimBetaProOffer } from "@/app/actions/billing";
import { useToast } from "@/components/Toaster";
import { cn } from "@/lib/utils";

/** Claims the beta month of Pro for the active workspace. The server decides everything. */
export function BetaClaimButton({ className, label = "Claim 1 month of Pro free", onClaimed }: { className?: string; label?: string; onClaimed?: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const claim = () => {
    setError(null);
    start(async () => {
      const r = await claimBetaProOffer();
      if (!r.ok) return setError(r.error);
      const until = new Date(r.endsAt).toLocaleDateString("en-US", { month: "long", day: "numeric" });
      toast({ tone: "outcome", title: "Pro is on", body: `Free until ${until}. No card, nothing to cancel.`, ttl: 8000 });
      onClaimed?.();
      router.refresh();
    });
  };
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={claim} disabled={pending} className={cn("inline-flex items-center justify-center h-11 px-5 rounded-lg bg-accent-strong text-white text-sm font-semibold hover:brightness-95 active:scale-[0.98] transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70", className)}>
        {pending ? "One moment…" : label}
      </button>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
