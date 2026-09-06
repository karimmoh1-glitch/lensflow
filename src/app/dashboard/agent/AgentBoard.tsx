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

  return (
    <div className="space-y-8">
      <section className="rounded-[22px] border border-border bg-white px-5 py-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-sans font-extrabold text-[1.5rem] tracking-[-0.03em] text-ink tabular-nums">{proposals.length}</span>
        <span className="text-sm text-ink/60">{proposals.length === 1 ? "thing" : "things"} the agent would do now</span>
        {total > 0 && <span className="ml-auto text-sm text-ink/60"><span className="font-semibold text-ink tabular-nums">{formatMoney(total)}</span> at stake</span>}
      </section>

      {proposals.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-border px-6 py-12 text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-success-soft text-success-text flex items-center justify-center"><Check className="w-5 h-5" strokeWidth={2.5} aria-hidden /></div>
          <p className="mt-3 text-sm font-semibold text-ink">Nothing needs the agent right now.</p>
          <p className="mt-1 text-xs text-ink/55">Everyone has a reply, upcoming bookings are confirmed, and nothing is overdue. It checks again every time you open this page.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {proposals.map((p) => {
            const k = KIND[p.kind];
            const isOpen = open === p.id;
            return (
              <li key={p.id} className={cn("rounded-[22px] border bg-white transition-colors", isOpen ? "border-ink/25 shadow-[0_18px_44px_-30px_rgba(16,17,20,0.35)]" : "border-border")}>
                <div className="px-4 md:px-5 py-4 flex gap-3.5">
                  <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", k.tone)}><k.icon className="w-4 h-4" strokeWidth={2} aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45">{k.label}</span>
                      {p.valueCents ? <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/45">· {formatMoney(p.valueCents)}</span> : null}
                    </div>
                    <h3 className="mt-0.5 text-[15px] font-semibold text-ink leading-snug">{p.title}</h3>
                    <p className="mt-0.5 text-sm text-ink/60 leading-snug">{p.why}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {p.kind === "reconnect_calendar" ? (
                        <Link href={p.href ?? "/dashboard/settings?tab=connections"} className="inline-flex items-center h-9 px-4 rounded-full bg-ink text-white text-sm font-semibold">Open calendar settings <ArrowRight className="w-3.5 h-3.5 ml-1.5" strokeWidth={2.5} aria-hidden /></Link>
                      ) : isOpen ? null : (
                        <Button size="md" onClick={() => review(p)} loading={preparing === p.id} loadingLabel="Drafting">Review &amp; send</Button>
                      )}
                      {p.href && p.kind !== "reconnect_calendar" && <Link href={p.href} className="text-xs font-semibold text-ink/55 hover:text-ink px-2 py-1">Open</Link>}
                      <button type="button" onClick={() => dismiss(p)} disabled={pending} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-ink/45 hover:text-ink px-2 py-1 rounded-md hover:bg-black/[0.05]"><X className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /> Not now</button>
                    </div>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-border px-4 md:px-5 py-4 bg-paper/60 rounded-b-[22px]">
                    <label htmlFor={`draft-${p.id}`} className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/45">Message{p.channel ? ` · ${p.channel.toLowerCase()}` : ""}</label>
                    <div className="mt-1.5"><Textarea id={`draft-${p.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} /></div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button size="md" onClick={() => approve(p)} loading={pending} loadingLabel="Sending" disabled={!draft.trim()}>Send</Button>
                      <button type="button" onClick={() => setOpen(null)} className="text-xs font-semibold text-ink/55 hover:text-ink px-2 py-1">Cancel</button>
                      <span className="ml-auto text-[11px] text-ink/45">Goes out as you. Lands in the thread.</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {initial.activity.length > 0 && (
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/50 mb-2.5 px-1">Agent activity · last 7 days</h2>
          <ul className="rounded-[22px] border border-border bg-white divide-y divide-border">
            {initial.activity.map((a, i) => (
              <li key={i} className="px-4 py-3 flex items-center gap-3 text-sm">
                <span className={cn("w-2 h-2 rounded-full shrink-0", a.result === "sent" ? "bg-success" : a.result === "dismissed" ? "bg-black/20" : "bg-warning")} aria-hidden />
                <span className="flex-1 min-w-0 truncate text-ink">{a.title}</span>
                <span className="text-xs text-ink/50 shrink-0">{a.result === "sent" ? "Sent" : a.result === "dismissed" ? "Dismissed" : a.result === "not_delivered" ? "Not delivered" : a.result}</span>
                <span className="text-xs text-ink/40 shrink-0">{formatDistanceToNowStrict(new Date(a.at), { addSuffix: true })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
