"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, CalendarCheck, Wallet, RotateCcw, CalendarX2, ArrowRight, Check, X } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { cn, formatMoney } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { prepareAgentProposal, approveAgentProposal, dismissAgentProposal } from "@/app/actions/agent";
import type { AgentProposal, ProposalKind } from "@/server/businessAgent";

type Activity = { at: string; kind: ProposalKind; title: string; result: string };

const KIND: Record<ProposalKind, { icon: typeof MessageSquare; label: string; tone: string }> = {
  reply: { icon: MessageSquare, label: "Reply", tone: "bg-accent-soft text-accent-text" },
  confirm_booking: { icon: CalendarCheck, label: "Confirm", tone: "bg-success-soft text-success-text" },
  payment_reminder: { icon: Wallet, label: "Payment", tone: "bg-warning-soft text-warning-text" },
  follow_up: { icon: RotateCcw, label: "Follow up", tone: "bg-signal-soft text-signal-text" },
  reconnect_calendar: { icon: CalendarX2, label: "Calendar", tone: "bg-danger-soft text-danger-text" },
};

/**
 * Proposals, one card each: what, why, and the value at stake. "Review" opens the message
 * the agent would send (drafted on the server from the real thread); "Send" approves it.
 * Every button calls a server action that re-checks the plan — this board never decides
 * anything on its own.
 */
export function AgentBoard({ initial }: { initial: { generatedAt: string; proposals: AgentProposal[]; activity: Activity[] } }) {
  const [proposals, setProposals] = useState(initial.proposals);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [preparing, setPreparing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const gate = (r: { allowed: boolean; reason?: string }) => {
    if (r.allowed) return false;
    toast({ tone: "signal", title: "Business plan required", body: (r as { reason: string }).reason });
    router.refresh();
    return true;
  };

  function review(p: AgentProposal) {
    if (p.kind === "reconnect_calendar") return;
    setPreparing(p.id);
    start(async () => {
      const r = await prepareAgentProposal(p.id);
      setPreparing(null);
      if (!r.allowed) return void gate(r);
      if ("error" in r) {
        toast({ tone: "neutral", title: "No longer current", body: r.error });
        setProposals((ps) => ps.filter((x) => x.id !== p.id));
        return;
      }
      setDraft(r.draft ?? "");
      setOpen(p.id);
    });
  }
  function approve(p: AgentProposal) {
    start(async () => {
      const r = await approveAgentProposal({ proposalId: p.id, body: draft });
      if (!r.allowed) return void gate(r);
      if (!r.ok) return toast({ tone: "signal", title: "Not sent", body: r.error });
      toast({ tone: r.status === "SENT" ? "outcome" : "signal", title: r.status === "SENT" ? "Sent" : "Saved, not delivered", body: r.note, ttl: r.status === "SENT" ? 4000 : 7000 });
      setProposals((ps) => ps.filter((x) => x.id !== p.id));
      setOpen(null);
      router.refresh();
    });
  }
  function dismiss(p: AgentProposal) {
    start(async () => {
      const r = await dismissAgentProposal(p.id);
      if (!r.allowed) return void gate(r);
      setProposals((ps) => ps.filter((x) => x.id !== p.id));
      if (open === p.id) setOpen(null);
    });
  }

  const total = proposals.reduce((s, p) => s + (p.valueCents ?? 0), 0);
  const counts = proposals.reduce<Record<ProposalKind, number>>((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] ?? 0) + 1 }), { reply: 0, confirm_booking: 0, payment_reminder: 0, follow_up: 0, reconnect_calendar: 0 });
  const noticed = [
    counts.reply ? `${counts.reply} ${counts.reply === 1 ? "person is" : "people are"} waiting on a reply` : null,
    counts.confirm_booking ? `${counts.confirm_booking} booking${counts.confirm_booking === 1 ? " isn't" : "s aren't"} confirmed yet` : null,
    counts.payment_reminder ? `${counts.payment_reminder} payment${counts.payment_reminder === 1 ? "" : "s"} still open` : null,
    counts.follow_up ? `${counts.follow_up} lead${counts.follow_up === 1 ? "" : "s"} went quiet after you replied` : null,
    counts.reconnect_calendar ? `a calendar stopped syncing` : null,
  ].filter(Boolean) as string[];
  const actionable = proposals.filter((p) => p.kind !== "reconnect_calendar");
  const recommendations = proposals.filter((p) => p.kind === "reconnect_calendar");

  const card = (p: AgentProposal) => {
    const k = KIND[p.kind];
    const isOpen = open === p.id;
    const recommendationOnly = p.kind === "reconnect_calendar";
    return (
      <li key={p.id} className={cn("rounded-[22px] border bg-white transition-colors", isOpen ? "border-ink/25 shadow-[0_18px_44px_-30px_rgba(16,17,20,0.35)]" : "border-border")}>
        <div className="px-4 md:px-5 py-4 flex gap-3.5">
          <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", k.tone)}><k.icon className="w-4 h-4" strokeWidth={2} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45">{k.label}</span>
              {p.valueCents ? <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45">· {formatMoney(p.valueCents)}</span> : null}
              <span className={cn("ml-auto text-[10px] font-bold uppercase tracking-[0.1em] rounded-full px-1.5 py-0.5", recommendationOnly ? "bg-black/[0.05] text-ink/55" : isOpen ? "bg-signal-soft text-signal-text" : "bg-success-soft text-success-text")}>{recommendationOnly ? "Recommendation" : isOpen ? "Preview · needs your approval" : "Ready with your approval"}</span>
            </div>
            <h3 className="mt-0.5 text-[15px] font-semibold text-ink leading-snug">{p.title}</h3>
            <p className="mt-0.5 text-sm text-ink/60 leading-snug">{p.why}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {recommendationOnly ? (
                <Link href={p.href ?? "/dashboard/settings?tab=connections"} className="inline-flex items-center h-9 px-4 rounded-full bg-ink text-white text-sm font-semibold">Open calendar settings <ArrowRight className="w-3.5 h-3.5 ml-1.5" strokeWidth={2.5} aria-hidden /></Link>
              ) : isOpen ? null : (
                <Button size="md" onClick={() => review(p)} loading={preparing === p.id} loadingLabel="Drafting">Review &amp; send</Button>
              )}
              {p.href && !recommendationOnly && <Link href={p.href} className="text-xs font-semibold text-ink/55 hover:text-ink px-2 py-1">Open</Link>}
              <button type="button" onClick={() => dismiss(p)} disabled={pending} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-ink/45 hover:text-ink px-2 py-1 rounded-md hover:bg-black/[0.05]"><X className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /> Not now</button>
            </div>
          </div>
        </div>
        {isOpen && (
          <div className="border-t border-border px-4 md:px-5 py-4 bg-paper/60 rounded-b-[22px]">
            <label htmlFor={`draft-${p.id}`} className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/45">Message{p.channel ? ` · ${p.channel.toLowerCase()}` : ""}</label>
            <div className="mt-1.5"><Textarea id={`draft-${p.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} /></div>
            <div className="mt-3 flex items-center gap-2">
              <Button size="md" onClick={() => approve(p)} loading={pending} loadingLabel="Sending" disabled={!draft.trim()}>Approve &amp; send</Button>
              <button type="button" onClick={() => setOpen(null)} className="text-xs font-semibold text-ink/55 hover:text-ink px-2 py-1">Cancel</button>
              <span className="ml-auto text-[11px] text-ink/45">Goes out as you. Lands in the thread.</span>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-8">
      <section aria-label="What I noticed" className="rounded-[22px] border border-border bg-white px-5 py-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-signal-text">What I noticed</div>
        {noticed.length === 0 ? (
          <p className="mt-1.5 text-sm text-ink/70">Everyone has a reply, upcoming bookings are confirmed, nothing is overdue and your calendars are syncing. I check again every time you open this page.</p>
        ) : (
          <p className="mt-1.5 text-sm text-ink/80 leading-relaxed">{noticed.map((n, i) => <span key={n}>{i > 0 ? (i === noticed.length - 1 ? " and " : ", ") : ""}<span className="font-semibold text-ink">{n}</span></span>)}.{total > 0 ? <span className="text-ink/60"> About {formatMoney(total)} is riding on it.</span> : null}</p>
        )}
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-paper px-2 py-2"><dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink/45">Ready to send</dt><dd className="text-lg font-extrabold text-ink tabular-nums">{actionable.length}</dd></div>
          <div className="rounded-xl bg-paper px-2 py-2"><dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink/45">Recommendations</dt><dd className="text-lg font-extrabold text-ink tabular-nums">{recommendations.length}</dd></div>
          <div className="rounded-xl bg-paper px-2 py-2"><dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink/45">Done this week</dt><dd className="text-lg font-extrabold text-ink tabular-nums">{initial.activity.filter((a) => a.result === "sent").length}</dd></div>
        </dl>
      </section>

      {actionable.length > 0 && (
        <section aria-label="What I recommend">
          <div className="flex items-baseline gap-3 mb-2.5 px-1"><h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/50">What I&rsquo;d do next</h2><span className="text-[11px] text-ink/40">Review the message, then approve. Nothing goes out on its own.</span></div>
          <ul className="space-y-3">{actionable.map(card)}</ul>
        </section>
      )}
      {recommendations.length > 0 && (
        <section aria-label="Needs you">
          <div className="flex items-baseline gap-3 mb-2.5 px-1"><h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/50">Needs you</h2><span className="text-[11px] text-ink/40">Things only you can fix.</span></div>
          <ul className="space-y-3">{recommendations.map(card)}</ul>
        </section>
      )}
      {proposals.length === 0 && (
        <div className="rounded-[22px] border border-dashed border-border px-6 py-10 text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-success-soft text-success-text flex items-center justify-center"><Check className="w-5 h-5" strokeWidth={2.5} aria-hidden /></div>
          <p className="mt-3 text-sm font-semibold text-ink">Nothing needs the agent right now.</p>
        </div>
      )}

      <section aria-label="What I can handle" className="rounded-[22px] border border-border bg-paper/60 px-5 py-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/50">What I can handle</div>
        <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-ink/75">
          <li><span className="font-semibold text-ink">Replies</span> — drafted from the thread and your price list; you approve.</li>
          <li><span className="font-semibold text-ink">Confirmations</span> — sent to the client and the booking marked confirmed once delivered.</li>
          <li><span className="font-semibold text-ink">Payment reminders</span> — for open deposits and balances, with the reference.</li>
          <li><span className="font-semibold text-ink">Follow-ups</span> — for leads that went quiet after you replied.</li>
          <li className="sm:col-span-2 text-ink/55">I never send without approval, never mark anything sent that wasn&rsquo;t delivered, and never touch payments or calendars directly — those I point you to.</li>
        </ul>
      </section>

      {initial.activity.length > 0 && (
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/50 mb-2.5 px-1">Agent activity · last 7 days</h2>
          <ul className="rounded-[22px] border border-border bg-white divide-y divide-border">
            {initial.activity.map((a, i) => (
              <li key={i} className="px-4 py-3 flex items-center gap-3 text-sm">
                <span className={cn("w-2 h-2 rounded-full shrink-0", a.result === "sent" ? "bg-success" : a.result === "dismissed" ? "bg-black/20" : "bg-warning")} aria-hidden />
                <span className="flex-1 min-w-0 truncate text-ink">{a.title}</span>
                <span className="text-xs text-ink/50 shrink-0">{a.result === "sent" ? "Sent" : a.result === "dismissed" ? "Dismissed" : a.result === "not_delivered" ? "Not delivered" : a.result}</span>
                <span className="text-xs text-ink/40 shrink-0" suppressHydrationWarning>{formatDistanceToNowStrict(new Date(a.at), { addSuffix: true })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
