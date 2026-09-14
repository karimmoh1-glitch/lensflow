"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLeadStatus } from "@/app/actions/leads";
import { useToast } from "@/components/Toaster";

/** The inferred stage, and the owner's word over it. Won is a booking, made from the booking control above. */
export function LeadStageControl({ leadId, status, stageLabel, stageWhy }: { leadId: string; status: string; stageLabel: string; stageWhy: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const set = (s: "QUALIFIED" | "COLD" | "LOST") => start(async () => {
    const r = await setLeadStatus(leadId, s);
    if (r.error) { toast({ tone: "signal", title: "Couldn't change that", body: r.error }); return; }
    toast({ tone: "neutral", title: s === "QUALIFIED" ? "Marked qualified" : s === "COLD" ? "Set aside" : "Marked lost" });
    router.refresh();
  });
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/65 mb-1.5">Stage</div>
      <p className="text-sm font-semibold text-ink">{stageLabel}</p>
      <p className="text-xs text-ink/65 leading-snug">{stageWhy}</p>
      {status !== "BOOKED" && status !== "LOST" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {status !== "QUALIFIED" && <button type="button" disabled={pending} onClick={() => set("QUALIFIED")} className="h-7 px-2.5 rounded-full border border-border bg-white text-[11px] font-semibold text-ink hover:border-ink/30 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Mark qualified</button>}
          {status !== "COLD" && <button type="button" disabled={pending} onClick={() => set("COLD")} className="h-7 px-2.5 rounded-full border border-border bg-white text-[11px] font-semibold text-ink hover:border-ink/30 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Set aside</button>}
          <button type="button" disabled={pending} onClick={() => set("LOST")} className="h-7 px-2.5 rounded-full border border-border bg-white text-[11px] font-semibold text-ink/65 hover:text-danger-text hover:border-danger/40 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Mark lost</button>
        </div>
      )}
    </div>
  );
}
