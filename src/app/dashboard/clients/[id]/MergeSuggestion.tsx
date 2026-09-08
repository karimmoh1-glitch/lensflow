"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mergeClients, dismissMerge } from "@/app/actions/clients";
import { useToast } from "@/components/Toaster";
import type { MergeCandidate } from "@/server/identity";

/**
 * "Might be the same person." Daythread joins records on an exact email, phone or
 * Instagram id by itself; anything weaker is put in front of the owner. Merge folds the
 * other record into this one; Not the same is remembered.
 */
export function MergeSuggestion({ clientId, name, candidates }: { clientId: string; name: string; candidates: MergeCandidate[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const live = candidates.filter((c) => !hidden.has(c.id));
  if (live.length === 0) return null;

  function act(c: MergeCandidate, merge: boolean) {
    startTransition(async () => {
      const r = merge ? await mergeClients(clientId, c.id) : await dismissMerge(clientId, c.id);
      if (!r.ok) { toast({ tone: "signal", title: "That didn't save", body: r.error }); return; }
      setHidden((h) => new Set(h).add(c.id));
      toast({ tone: "outcome", title: merge ? `Merged ${c.name} into ${name}` : "Kept as two people" });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="merge-title" className="mb-6 rounded-2xl border border-signal/25 bg-signal-soft/30 px-4 py-3.5">
      <h2 id="merge-title" className="text-[11px] font-bold uppercase tracking-[0.14em] text-signal-text">Might be the same person</h2>
      <ul className="mt-2 space-y-2">
        {live.map((c) => (
          <li key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{c.name}<span className="font-normal text-ink/65"> · {[c.email, c.phone, c.instagram ? "Instagram" : null].filter(Boolean).join(" · ") || "no email or phone"} · {c.conversations} {c.conversations === 1 ? "conversation" : "conversations"}, {c.bookings} {c.bookings === 1 ? "booking" : "bookings"}</span></p>
              <p className="text-xs text-ink/70">{c.why}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" disabled={pending} onClick={() => act(c, true)} className="h-9 px-3.5 rounded-full bg-ink text-white text-xs font-bold disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Merge into {name.split(" ")[0]}</button>
              <button type="button" disabled={pending} onClick={() => act(c, false)} className="h-9 px-3.5 rounded-full border border-border bg-white text-xs font-semibold text-ink/80 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Not the same</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
