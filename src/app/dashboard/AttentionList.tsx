import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAttention, type AttentionRow } from "@/server/attention";
import { cn } from "@/lib/utils";

const TONE: Record<AttentionRow["item"]["kind"], string> = {
  waiting_reply: "bg-accent-soft text-accent-text",
  follow_up_due: "bg-signal-soft text-signal-text",
  follow_up_suggested: "bg-signal-soft text-signal-text",
  confirm_booking: "bg-warning-soft text-ink",
};

/**
 * Needs attention: every person and booking that needs the owner, each with the rule it
 * rests on written out. Nothing is scored or guessed — see src/lib/attention.ts.
 */
export async function AttentionList({ businessId, timezone, skipLeadId }: { businessId: string; timezone: string; skipLeadId?: string | null }) {
  const rows = (await getAttention(businessId, new Date(), timezone)).filter((r) => !skipLeadId || r.leadId !== skipLeadId);
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="attention-label" className="mt-6">
      <div className="flex items-baseline justify-between gap-4 mb-2.5">
        <h2 id="attention-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65">Needs attention</h2>
        <span className="text-[11px] text-ink/65">Each line says why. Nothing here is guessed.</span>
      </div>
      <ol className="space-y-2">
        {rows.slice(0, 8).map((r) => (
          <li key={r.id}>
            <Link href={r.href} className="group flex items-start sm:items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 transition-all duration-150 hover:border-ink/20 hover:translate-x-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
              <span className={cn("mt-0.5 sm:mt-0 inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0", TONE[r.item.kind])}>{r.item.label}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink truncate">{r.name}{r.detail ? <span className="text-ink/65 font-normal"> · {r.detail}</span> : null}</span>
                <span className="block text-xs text-ink/70">{r.item.why}</span>
              </span>
              <ArrowRight className="w-4 h-4 text-ink/30 shrink-0 transition-all group-hover:text-ink group-hover:translate-x-0.5 hidden sm:block" strokeWidth={2} aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
      {rows.length > 8 && <Link href="/dashboard/inbox?filter=unanswered" className="inline-block mt-2 text-xs font-semibold text-ink/70 hover:text-ink pl-1">{rows.length - 8} more in the inbox →</Link>}
    </section>
  );
}
