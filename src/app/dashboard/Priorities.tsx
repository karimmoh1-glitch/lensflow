import Link from "next/link";
import { Check } from "lucide-react";
import { setupSteps } from "@/server/setupSteps";
import { cn } from "@/lib/utils";

/** Today's setup checklist, in the rail. Gone the moment every step is done. */
export async function Priorities({ businessId }: { businessId: string }) {
  const steps = await setupSteps(businessId);
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done)!;

  return (
    <section aria-labelledby="setup-label" className="rounded-lg border border-border">
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="setup-label" className="text-13 font-semibold text-ink">Set up Daythread</h2>
          <span className="text-xs text-ink/65 tabular-nums">{done} of {steps.length}</span>
        </div>
        <div aria-hidden className="mt-2.5 h-1 rounded-full bg-ink/[0.08] overflow-hidden">
          <div className="h-full bg-ink rounded-full" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="border-t border-border py-1.5">
        {steps.map((s) => {
          const isNext = s.key === next.key;
          return (
            <li key={s.key} className={cn("px-4 py-1.5", isNext && "py-2.5")}>
              <div className="flex items-start gap-2.5">
                <span aria-hidden className={cn("mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0", s.done ? "bg-ink text-white" : isNext ? "border-[1.5px] border-ink" : "border border-ink/25")}>
                  {s.done && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-13", s.done ? "text-ink/65" : isNext ? "font-medium text-ink" : "text-ink/80")}>
                    {s.title}
                    {s.done && <span className="sr-only"> (done)</span>}
                  </p>
                  {isNext && (
                    <>
                      <p className="mt-0.5 text-xs text-ink/65">{s.detail}</p>
                      <Link href={s.href} className="mt-2.5 inline-flex items-center h-8 px-3 rounded bg-ink text-white text-13 font-medium hover:bg-[#2A2B30] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2">
                        {s.cta}
                      </Link>
                    </>
                  )}
                </div>
                {!s.done && !isNext && (
                  <Link href={s.href} className="shrink-0 -my-1 inline-flex items-center h-7 px-2 rounded text-xs font-medium text-ink/70 hover:text-ink hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70">
                    {s.cta}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
