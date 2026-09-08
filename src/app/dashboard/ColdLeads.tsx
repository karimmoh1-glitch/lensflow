"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setFollowUp } from "@/app/actions/followUp";
import { setLeadStatus } from "@/app/actions/leads";
import { useToast } from "@/components/Toaster";
import { cn } from "@/lib/utils";
import type { ColdLead } from "@/server/coldLeads";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/**
 * Leads going cold: the people who showed intent, got a reply, and went quiet. Each card
 * says what happened and why it is here, and offers the four things the owner can do about
 * it. Nothing here sends anything; Draft opens the thread with a follow-up ready to edit.
 */
export function ColdLeads({ leads }: { leads: ColdLead[] }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const visible = leads.filter((l) => !gone.has(l.leadId));
  if (visible.length === 0) return null;

  const act = (lead: ColdLead, what: "tomorrow" | "dismiss" | "lost") =>
    start(async () => {
      if (what === "tomorrow") {
        const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
        const r = await setFollowUp(lead.leadId, d.toISOString());
        if (r.error) { toast({ tone: "signal", title: "Couldn't set that", body: r.error }); return; }
        toast({ tone: "outcome", title: `Follow-up set for tomorrow`, body: `${lead.name} will be back under Needs attention in the morning.` });
      } else {
        const r = await setLeadStatus(lead.leadId, what === "dismiss" ? "COLD" : "LOST");
        if (r.error) { toast({ tone: "signal", title: "Couldn't do that", body: r.error }); return; }
        toast({ tone: "neutral", title: what === "dismiss" ? `${lead.name} set aside` : `${lead.name} marked lost`, body: what === "dismiss" ? "They come back the moment they write again." : "Nothing was deleted; the thread is still in the inbox." });
      }
      setGone((s) => new Set(s).add(lead.leadId));
      router.refresh();
    });

  return (
    <section aria-labelledby="cold-label" className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2.5">
        <h2 id="cold-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-warning-text">Leads going cold</h2>
        <span className="text-[11px] text-ink/65">People who showed intent, got your reply, and went quiet.</span>
      </div>
      <ul className="space-y-2">
        {visible.map((l) => (
          <li key={l.leadId} className="rounded-2xl border border-warning/30 bg-white px-4 py-3.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Link href={l.conversationId ? `/dashboard/inbox?c=${l.conversationId}` : "/dashboard/inbox"} className="text-sm font-extrabold text-ink hover:underline">{l.name}</Link>
              <span className="text-xs text-ink/65">{l.opportunity.label}{l.estimatedValueCents ? ` · about ${money(l.estimatedValueCents)}` : ""} · quiet {l.daysQuiet === 1 ? "1 day" : `${l.daysQuiet} days`}</span>
            </div>
            <p className="mt-1 text-sm text-ink/80">{l.happened}</p>
            <p className="mt-0.5 text-xs text-ink/65"><span className="font-semibold text-ink/80">Why it&rsquo;s here:</span> {l.opportunity.reason}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Link href={l.conversationId ? `/dashboard/inbox?c=${l.conversationId}&draft=follow_up` : "/dashboard/inbox"} className="inline-flex items-center h-8 px-3 rounded-full bg-ink text-white text-xs font-bold hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Draft follow-up</Link>
              {(["tomorrow", "dismiss", "lost"] as const).map((what) => (
                <button key={what} type="button" disabled={pending} onClick={() => act(l, what)} className={cn("inline-flex items-center h-8 px-3 rounded-full border text-xs font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50", what === "lost" ? "border-border text-ink/65 hover:text-danger-text hover:border-danger/40" : "border-border bg-white text-ink hover:border-ink/30")}>
                  {what === "tomorrow" ? "Follow up tomorrow" : what === "dismiss" ? "Set aside" : "Mark lost"}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
