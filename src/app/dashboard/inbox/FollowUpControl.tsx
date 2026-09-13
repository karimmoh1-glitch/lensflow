"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, nextMonday, setHours, setMinutes, startOfDay } from "date-fns";
import { X } from "lucide-react";
import { setFollowUp } from "@/app/actions/followUp";
import { useToast } from "@/components/Toaster";
import { cn } from "@/lib/utils";

/**
 * "Follow up on…" — a date on this person. When it arrives they appear under Needs
 * attention as "Follow-up due", and their own reply clears it. Quick choices plus any date.
 */
export function FollowUpControl({ leadId, followUpAt }: { leadId: string; followUpAt: string | null }) {
  const [current, setCurrent] = useState<string | null>(followUpAt);
  const [custom, setCustom] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const at9 = (d: Date) => setMinutes(setHours(startOfDay(d), 9), 0);
  const choices: [string, Date][] = [["Tomorrow", at9(addDays(new Date(), 1))], ["In 3 days", at9(addDays(new Date(), 3))], ["Next Monday", at9(nextMonday(new Date()))]];

  const save = (d: Date | null) =>
    start(async () => {
      const res = await setFollowUp(leadId, d ? d.toISOString() : null);
      if (res.error) { toast({ tone: "signal", title: "Couldn't set that", body: res.error }); return; }
      setCurrent(res.followUpAt ?? null);
      setCustom(false);
      toast({ tone: "outcome", title: d ? `Follow-up set for ${format(d, "EEE, MMM d")}` : "Reminder cleared", body: d ? "They'll appear under Needs attention on Today that morning." : undefined });
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-ink/65">Follow up</h3>
      {current ? (
        <div className="flex items-center justify-between gap-2 rounded border border-border bg-paper px-3 py-1.5">
          <span className="text-xs text-ink/80"><span className="font-medium text-ink">{format(new Date(current), "EEE, MMM d")}</span>{new Date(current) <= new Date() ? " · due now" : ""}</span>
          <button type="button" onClick={() => save(null)} disabled={pending} aria-label="Clear follow-up reminder" className="w-7 h-7 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 rounded-full inline-flex items-center justify-center text-ink/60 hover:text-ink hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70"><X className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden /></button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {choices.map(([label, d]) => (
            <button key={label} type="button" onClick={() => save(d)} disabled={pending} className="h-8 px-2.5 rounded border border-border-strong bg-white shadow-xs text-xs font-medium text-ink hover:bg-paper disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">{label}</button>
          ))}
          <button type="button" onClick={() => setCustom((c) => !c)} className={cn("h-8 px-2.5 rounded border text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70", custom ? "border-ink bg-ink text-white" : "border-border-strong bg-white text-ink shadow-xs hover:bg-paper")}>Pick a date</button>
        </div>
      )}
      {custom && !current && (
        <label className="block text-xs text-ink/70">
          <span className="sr-only">Follow-up date</span>
          <input type="date" min={format(addDays(new Date(), 1), "yyyy-MM-dd")} onChange={(e) => { if (e.target.value) save(at9(new Date(`${e.target.value}T09:00:00`))); }} className="h-9 rounded border border-border-strong bg-white px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70" />
        </label>
      )}
      <p className="text-xs text-ink/65">They&rsquo;ll appear under Needs attention that morning. Their own reply clears it.</p>
    </div>
  );
}
