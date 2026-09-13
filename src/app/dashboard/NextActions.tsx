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

  const btn = "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-13 font-semibold transition-[background-color,border-color,transform] duration-150 active:translate-y-px disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2";
  const primary = cn(btn, "bg-ink text-white hover:bg-black");
  const quiet = cn(btn, "border border-ink/[0.12] bg-white text-ink hover:border-ink/25");

  return (
    <section aria-labelledby="now-label">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2.5">
        <h2 id="now-label" className="text-13 font-semibold text-ink/70">Needs you{live.length > 0 ? <span className="ml-1.5 font-normal text-ink/60 tabular-nums">{live.length}</span> : null}</h2>
        {risk && <p className="text-xs text-ink/60">{risk}</p>}
      </div>

      {!top ? (
        <div className="rounded-xl border border-border bg-white shadow-surface px-5 py-4 flex items-center gap-3 dt-swap">
          <span className="w-2 h-2 rounded-full bg-success shrink-0" aria-hidden />
          <p className="text-sm text-ink/70">{caughtUp}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white shadow-surface overflow-hidden">
          <article aria-label={top.headline} className="px-4 sm:px-5 py-4 sm:py-5">
            <div className="flex items-start gap-3.5">
              <span className="relative w-10 h-10 rounded-full bg-ink/[0.06] text-ink/75 flex items-center justify-center text-13 font-semibold shrink-0">
                {looksLikeHandle(top.person.name) ? "New" : initials(top.person.name)}
                {top.rule === "waiting_reply" && <span aria-hidden className="absolute -top-px -right-px w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-white" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h3 className="text-[1.0625rem] font-semibold leading-snug tracking-[-0.01em] text-ink">{top.headline}</h3>
                  <span className="text-xs text-ink/60">{top.stage}</span>
                </div>
                <p className="mt-1 text-sm text-ink/70 leading-snug">{top.why}{top.detail ? ` ${top.detail}.` : ""}</p>
                {top.value && <p className="mt-1 text-xs text-ink/60">{top.value.label}{top.value.known ? "" : " · estimate"}</p>}
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {top.kind === "confirm_booking" ? (
                    <Link href={top.href} className={primary}>Open booking<ArrowRight className="w-3.5 h-3.5" strokeWidth={2.2} aria-hidden /></Link>
                  ) : (
                    <>
                      <Link href={draftHref(top)} className={primary}>{top.kind === "reply" ? "Draft reply" : "Draft follow-up"}<ArrowRight className="w-3.5 h-3.5" strokeWidth={2.2} aria-hidden /></Link>
                      {top.kind === "reply" ? (
                        <button type="button" disabled={pending} onClick={() => run(top, "handled")} className={quiet}>Mark handled</button>
                      ) : (
                        <>
                          <button type="button" disabled={pending} onClick={() => run(top, "tomorrow")} className={quiet}>Tomorrow</button>
                          <button type="button" disabled={pending} onClick={() => run(top, "aside")} className={cn(quiet, "border-transparent text-ink/60 hover:text-ink")}>Set aside</button>
                          <button type="button" disabled={pending} onClick={() => run(top, "lost")} className={cn(quiet, "border-transparent text-ink/60 hover:text-ink")}>Mark lost</button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </article>

          {rest.length > 0 && (
            <ol className="border-t border-border divide-y divide-border" aria-label="Also needs you">
              {rest.slice(0, 8).map((r) => (
                <li key={r.id} className="group flex items-center gap-3 px-4 sm:px-5 py-2.5 hover:bg-black/[0.02] transition-colors">
                  <span className={cn("w-16 text-xs font-medium shrink-0", r.rule === "waiting_reply" ? "text-ink" : "text-ink/60")}>
                    {r.rule === "waiting_reply" && <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-1.5 align-middle" />}
                    {CHIP_LABEL[r.rule]}
                  </span>
                  <Link href={r.href} className="min-w-0 flex-1 focus-visible:outline-none">
                    <span className="block text-13 text-ink truncate"><span className="font-semibold group-hover:underline">{r.person.name}</span><span className="text-ink/60"> · {withoutName(r.why, r.person.name)}{r.detail ? ` ${r.detail}.` : ""}</span></span>
                  </Link>
                  {r.value && <span className="hidden md:block text-xs text-ink/60 tabular-nums shrink-0">{r.value.label}</span>}
                  {r.kind !== "confirm_booking" && (
                    <span className="hidden sm:flex items-center gap-1 shrink-0">
                      <Link href={draftHref(r)} className="h-7 px-2.5 inline-flex items-center rounded-md text-xs font-semibold text-ink hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">{r.kind === "reply" ? "Draft reply" : "Draft follow-up"}</Link>
                      {r.kind === "reply" ? (
                        <button type="button" disabled={pending} onClick={() => run(r, "handled")} className="h-7 px-2.5 rounded-md text-xs font-medium text-ink/60 hover:text-ink hover:bg-black/[0.05] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">Handled</button>
                      ) : (
                        <button type="button" disabled={pending} onClick={() => run(r, "tomorrow")} className="h-7 px-2.5 rounded-md text-xs font-medium text-ink/60 hover:text-ink hover:bg-black/[0.05] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">Tomorrow</button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {rest.length > 8 && <Link href="/dashboard/inbox?filter=unanswered" className="inline-block mt-2 text-xs font-medium text-ink/60 hover:text-ink pl-1">{rest.length - 8} more in the inbox</Link>}
    </section>
  );
}

/** "Diego Ramirez · Family Session is tomorrow…" already sits beside the name; say it once. */
function withoutName(text: string, name: string): string {
  const t = text.trim();
  return t.toLowerCase().startsWith(`${name.toLowerCase()} · `) ? t.slice(name.length + 3) : t;
}
