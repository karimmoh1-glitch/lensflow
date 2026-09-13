import Link from "next/link";
import { Check } from "lucide-react";
import { setupSteps } from "@/server/setupSteps";
import { cn } from "@/lib/utils";

/** Today's setup checklist. Gone the moment every step is done. */
export async function Priorities({ businessId }: { businessId: string }) {
  const steps = await setupSteps(businessId);
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done)!;

  return (
    <section aria-labelledby="setup-label" className="mb-8 rounded-xl border border-border bg-white shadow-surface overflow-hidden">
      <div className="px-4 md:px-5 pt-4 pb-3 flex items-center justify-between gap-4">
        <h2 id="setup-label" className="text-13 font-semibold text-ink">Finish setting up</h2>
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-ink/55 tabular-nums">{done} of {steps.length} done</span>
          <span aria-hidden className="hidden sm:flex gap-0.5">
            {steps.map((s) => <span key={s.key} className={cn("h-1 w-4 rounded-full", s.done ? "bg-ink" : "bg-ink/10")} />)}
          </span>
        </div>
      </div>
      <ol className="border-t border-border divide-y divide-border">
        {steps.map((s, i) => {
          const isNext = s.key === next.key;
          return (
            <li key={s.key} className="grid grid-cols-[24px_minmax(0,1fr)] sm:grid-cols-[24px_minmax(0,1fr)_auto] items-start sm:items-center gap-x-3 gap-y-2 px-4 md:px-5 py-3">
              <span aria-hidden className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-2xs font-semibold tabular-nums", s.done ? "bg-ink text-white" : isNext ? "border border-ink/40 text-ink" : "border border-ink/15 text-ink/50")}>
                {s.done ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-13 font-semibold leading-5", s.done ? "text-ink/50" : "text-ink")}>
                  {s.title}
                  {s.done && <span className="sr-only"> (done)</span>}
                </p>
                {isNext && <p className="text-13 text-ink/55 leading-snug">{s.detail}</p>}
              </div>
              {!s.done && (
                <Link
                  href={s.href}
                  className={cn(
                    "col-start-2 sm:col-start-auto justify-self-start sm:justify-self-end inline-flex items-center h-9 sm:h-8 px-3 rounded-lg text-13 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2",
                    isNext ? "bg-ink text-white hover:bg-black" : "-ml-3 sm:ml-0 text-ink/70 hover:text-ink hover:bg-black/[0.04]"
                  )}
                >
                  {s.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
