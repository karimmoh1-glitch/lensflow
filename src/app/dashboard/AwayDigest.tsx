import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AwayDigest as Digest } from "@/server/awayDigest";

const TONE = { accent: "bg-accent", signal: "bg-signal", success: "bg-success", neutral: "bg-ink/30" } as const;
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** What changed since the last visit — counts from the record, each a link to the exact list. */
export function AwayDigest({ digest }: { digest: Digest }) {
  const hours = Math.round(digest.hoursAway);
  const away = hours < 48 ? `${hours} hours` : `${Math.round(hours / 24)} days`;
  return (
    <section aria-labelledby="away-label">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
        <h2 id="away-label" className="text-13 font-semibold text-ink">While you were away</h2>
        <span className="text-xs text-ink/65">The last {away}</span>
      </div>
      <ul className="flex flex-wrap gap-px bg-border rounded-lg border border-border overflow-hidden">
        {digest.items.map((it) => (
          <li key={it.key} className="bg-white flex-1 basis-[150px]">
            <Link href={it.href} className="block h-full px-4 py-3 hover:bg-paper transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/70">
              <span className="flex items-center gap-2 text-lg font-semibold tabular-nums text-ink">
                {it.count}
                <span aria-hidden className={cn("w-1.5 h-1.5 rounded-full", TONE[it.tone])} />
              </span>
              <span className="block text-xs text-ink/65 leading-snug">{it.label.replace(/^\d+ /, "")}</span>
            </Link>
          </li>
        ))}
      </ul>
      {digest.quotedCount > 0 && (
        <p className="mt-2.5 text-xs text-ink/65">
          {digest.quotedCents > 0 && <><span className="font-medium text-ink">{money(digest.quotedCents)}</span> quoted or budgeted</>}
          {digest.quotedCents > 0 && digest.estimatedCents > 0 && " and "}
          {digest.estimatedCents > 0 && <>about <span className="font-medium text-ink">{money(digest.estimatedCents)}</span> in service prices</>}
          {" "}across {digest.quotedCount} open {digest.quotedCount === 1 ? "opportunity" : "opportunities"}. Service prices are an estimate, not a forecast.
        </p>
      )}
    </section>
  );
}
