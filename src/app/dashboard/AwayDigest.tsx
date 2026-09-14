import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AwayDigest as Digest } from "@/server/awayDigest";

const TONE = { accent: "bg-accent", signal: "bg-signal", success: "bg-success", neutral: "bg-ink/30" } as const;
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** What changed since the last visit — counts from the record, each a link to the exact list. */
export function AwayDigest({ digest }: { digest: Digest }) {
  const hours = Math.round(digest.hoursAway);
  const away = hours < 48 ? `${hours} hours` : `${Math.round(hours / 24)} days`;
  return (
    <section aria-labelledby="away-label" className="mb-8 rounded-[22px] border border-border bg-white overflow-hidden">
      <div className="px-5 md:px-6 pt-5 pb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="away-label" className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65">While you were away</h2>
        <span className="text-[11px] text-ink/65">The last {away}. Counts, not guesses.</span>
      </div>
      <ul className="px-5 md:px-6 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {digest.items.map((it) => (
          <li key={it.key}>
            <Link href={it.href} className="group flex items-center gap-3 rounded-xl border border-border bg-paper px-3.5 py-2.5 text-sm text-ink hover:border-ink/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
              <span aria-hidden className={cn("w-2 h-2 rounded-full shrink-0", TONE[it.tone])} />
              <span className="flex-1 min-w-0 truncate"><span className="font-extrabold tabular-nums">{it.count}</span>{it.label.replace(/^\d+ /, " ")}</span>
              <ArrowRight className="w-3.5 h-3.5 text-ink/30 shrink-0 group-hover:text-ink" strokeWidth={2.5} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {digest.quotedCount > 0 && (
        <p className="px-5 md:px-6 pb-4 -mt-1 text-xs text-ink/70">
          {digest.quotedCents > 0 && <><span className="font-semibold text-ink">{money(digest.quotedCents)}</span> quoted or budgeted</>}
          {digest.quotedCents > 0 && digest.estimatedCents > 0 && " and "}
          {digest.estimatedCents > 0 && <>about <span className="font-semibold text-ink">{money(digest.estimatedCents)}</span> in service prices</>}
          {" "}across {digest.quotedCount} open {digest.quotedCount === 1 ? "opportunity" : "opportunities"}. Known money first; service prices are an estimate. Not a forecast.
        </p>
      )}
    </section>
  );
}
