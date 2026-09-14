"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { markLeadHandled, setLeadStatus } from "@/app/actions/leads";
import { setFollowUp } from "@/app/actions/followUp";
import { useToast } from "@/components/Toaster";
import { cn, firstName, initials } from "@/lib/utils";
import { looksLikeHandle } from "@/lib/nextAction";
import type { NextAction, MoneyAtRisk } from "@/lib/nextAction";
import { moneyAtRiskSentence } from "@/lib/nextAction";

/**
 * What to do next — one list, top item as the card. Every row is a person, the fact it
 * rests on, where things stand, what it is worth (and whether that is known or a
 * service's price), and the buttons that do it. Draft opens the thread already writing;
 * the rest write the record. Nothing here sends anything.
 */
type Row = Omit<NextAction, "since" | "booking"> & { since: string; booking: { startAt: string; location: string | null; totalCents: number | null; serviceName: string } | null };

const CHIP: Record<NextAction["rule"], string> = {
  waiting_reply: "bg-accent-soft text-accent-text",
  follow_up_due: "bg-signal-soft text-signal-text",
  follow_up_suggested: "bg-signal-soft text-signal-text",
  confirm_booking: "bg-warning-soft text-ink",
};
const CHIP_LABEL: Record<NextAction["rule"], string> = { waiting_reply: "Reply", follow_up_due: "Follow up", follow_up_suggested: "Follow up", confirm_booking: "Confirm" };

function tomorrowNine(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function NextActions({ rows, atRisk, caughtUp }: { rows: Row[]; atRisk: MoneyAtRisk; caughtUp: string }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const live = rows.filter((r) => !gone.has(r.id));
  const [top, ...rest] = live;
  const risk = moneyAtRiskSentence(atRisk);

  function settle(id: string, title: string) {
    setGone((g) => new Set(g).add(id));
    toast({ tone: "outcome", title, body: live.length > 1 ? "The next thing is up." : "That was the last one." });
    router.refresh();
  }
  function run(row: Row, what: "handled" | "tomorrow" | "aside" | "lost") {
    if (!row.person.leadId) return;
    const leadId = row.person.leadId;
    const first = firstName(row.person.name, "This person");
    startTransition(async () => {
      const res =
        what === "handled" ? await markLeadHandled(leadId)
        : what === "tomorrow" ? await setFollowUp(leadId, tomorrowNine())
        : what === "aside" ? await setLeadStatus(leadId, "COLD")
        : await setLeadStatus(leadId, "LOST");
      if (res.error) { toast({ tone: "signal", title: "That didn't save", body: res.error }); return; }
      settle(row.id, what === "handled" ? `${first} marked as handled` : what === "tomorrow" ? `Follow-up with ${first} set for tomorrow at 9` : what === "aside" ? `${first} set aside` : `${first} marked as lost`);
    });
  }
  const draftHref = (row: Row) => (row.draftMode && row.person.conversationId ? `/dashboard/inbox?c=${row.person.conversationId}&draft=${row.draftMode}` : row.href);

  return (
    <section aria-labelledby="now-label">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2.5">
        <h2 id="now-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-text">Now</h2>
        {risk && <p className="text-[11px] text-ink/70"><span className="font-semibold text-ink">Money at risk:</span> {risk}</p>}
      </div>

      {!top ? (
        <div className="rounded-2xl border border-success/25 bg-success-soft/50 px-5 py-4 flex items-center gap-3 dt-swap">
          <span className="w-2.5 h-2.5 rounded-full bg-success shrink-0" />
          <p className="text-sm text-ink/80">{caughtUp}</p>
        </div>
      ) : (
        <article aria-label={top.headline} className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft/70 to-white px-4 sm:px-5 py-4 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
          <div className="flex items-start gap-3 sm:gap-4">
            <span className="w-11 h-11 rounded-full bg-white text-accent-text flex items-center justify-center text-sm font-extrabold shrink-0 border border-accent/20">{looksLikeHandle(top.person.name) ? "New" : initials(top.person.name)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="font-sans font-extrabold text-[1.15rem] leading-tight tracking-[-0.02em] text-ink">{top.headline}</h3>
                <span className="inline-flex items-center h-5 px-2 rounded-full bg-white/80 border border-border text-[10px] font-bold uppercase tracking-[0.08em] text-ink/70">{top.stage}</span>
              </div>
              <p className="mt-1 text-sm text-ink/80 leading-snug">{top.why}{top.detail ? ` ${top.detail}.` : ""}</p>
              {top.value && <p className="mt-1 text-xs font-semibold text-ink/70">{top.value.label}{top.value.known ? "" : " · estimate"}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {top.kind === "confirm_booking" ? (
                  <Link href={top.href} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-accent-strong text-white text-sm font-extrabold hover:scale-[1.02] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Open booking<ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden /></Link>
                ) : (
                  <>
                    <Link href={draftHref(top)} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-accent-strong text-white text-sm font-extrabold hover:scale-[1.02] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">{top.kind === "reply" ? "Draft reply" : "Draft follow-up"}<ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden /></Link>
                    {top.kind === "reply" ? (
                      <button type="button" disabled={pending} onClick={() => run(top, "handled")} className="h-10 px-3.5 rounded-full border border-border bg-white text-sm font-semibold text-ink hover:border-ink/30 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Mark handled</button>
                    ) : (
                      <>
                        <button type="button" disabled={pending} onClick={() => run(top, "tomorrow")} className="h-10 px-3.5 rounded-full border border-border bg-white text-sm font-semibold text-ink hover:border-ink/30 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Follow up tomorrow</button>
                        <button type="button" disabled={pending} onClick={() => run(top, "aside")} className="h-10 px-3.5 rounded-full border border-border bg-white text-sm font-semibold text-ink/80 hover:border-ink/30 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Set aside</button>
                        <button type="button" disabled={pending} onClick={() => run(top, "lost")} className="h-10 px-3.5 rounded-full border border-border bg-white text-sm font-semibold text-ink/80 hover:border-ink/30 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">Mark lost</button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </article>
      )}

      {rest.length > 0 && (
        <ol className="mt-3 space-y-2" aria-label="Also needs you">
          {rest.slice(0, 8).map((r) => (
            <li key={r.id} className="flex items-start sm:items-center gap-3 rounded-xl border border-border bg-white px-4 py-3">
              <span className={cn("mt-0.5 sm:mt-0 inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0", CHIP[r.rule])}>{CHIP_LABEL[r.rule]}</span>
              <Link href={r.href} className="min-w-0 flex-1 group focus-visible:outline-none">
                <span className="block text-sm font-semibold text-ink truncate group-hover:underline">{r.person.name}<span className="text-ink/65 font-normal"> · {r.stage}</span>{r.value ? <span className="text-ink/65 font-normal"> · {r.value.label}</span> : null}</span>
                <span className="block text-xs text-ink/70">{r.why}{r.detail ? ` ${r.detail}.` : ""}</span>
              </Link>
              {r.kind !== "confirm_booking" && (
                <span className="hidden sm:flex items-center gap-1.5 shrink-0">
                  <Link href={draftHref(r)} className="h-8 px-3 inline-flex items-center rounded-full bg-accent-soft text-accent-text text-xs font-bold hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">{r.kind === "reply" ? "Draft reply" : "Draft follow-up"}</Link>
                  {r.kind === "reply" ? (
                    <button type="button" disabled={pending} onClick={() => run(r, "handled")} className="h-8 px-3 rounded-full border border-border text-xs font-semibold text-ink/80 hover:border-ink/30 disabled:opacity-60">Handled</button>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => run(r, "tomorrow")} className="h-8 px-3 rounded-full border border-border text-xs font-semibold text-ink/80 hover:border-ink/30 disabled:opacity-60">Tomorrow</button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {rest.length > 8 && <Link href="/dashboard/inbox?filter=unanswered" className="inline-block mt-2 text-xs font-semibold text-ink/70 hover:text-ink pl-1">{rest.length - 8} more in the inbox →</Link>}
    </section>
  );
}
