import { LinkButton } from "@/components/ui";
import { PLANS, type PlanKey } from "@/lib/billing";
import { formatMoney } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function PricingSection() {
  const order: PlanKey[] = ["FREE", "PRO", "BUSINESS"];

  return (
    <section className="px-6 py-16 md:py-20 max-w-5xl mx-auto">
      <div className="text-center max-w-md mx-auto mb-10">
        <h2 className="font-sans font-black text-2xl md:text-3xl tracking-tight text-ink">Simple pricing that grows with you</h2>
        <p className="mt-2 text-sm text-ink/55">Start free. Upgrade when your team or your client list outgrows it.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {order.map((key) => {
          const plan = PLANS[key];
          const isPro = key === "PRO";
          return (
            <div
              key={key}
              className={cn(
                "relative rounded-xl border p-6 bg-white flex flex-col",
                isPro ? "border-accent shadow-[0_4px_24px_-8px_rgba(240,82,77,0.28)]" : "border-border"
              )}
            >
              {isPro && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wide text-white bg-accent rounded-full px-2.5 py-1">
                  Most popular
                </span>
              )}
              <h3 className="font-sans font-black text-lg tracking-tight text-ink">{plan.name}</h3>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {plan.priceCents === 0 ? "Free" : formatMoney(plan.priceCents)}
                {plan.priceCents > 0 && <span className="text-sm font-normal text-ink/45">/mo</span>}
              </p>
              <p className="mt-2 text-xs text-ink/50">{plan.tagline}</p>
              <ul className="mt-4 space-y-1.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="text-xs text-ink/65 flex items-start gap-1.5">
                    <span className="text-success mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <LinkButton href="/signup" size="sm" variant={isPro ? "primary" : "outline"} className="w-full mt-5 rounded-full font-bold">
                {key === "FREE" ? "Start Free" : `Start with ${plan.name}`}
              </LinkButton>
            </div>
          );
        })}
      </div>
    </section>
  );
}
