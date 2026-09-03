import { LinkButton } from "@/components/ui";
import { PLANS, type PlanKey } from "@/lib/billing";
import { formatMoney } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { RevealOnScroll } from "./RevealOnScroll";

export function PricingSection() {
  const order: PlanKey[] = ["FREE", "PRO", "BUSINESS"];

  return (
    <section className="px-6 py-16 md:py-24 max-w-5xl mx-auto">
      <div className="text-center max-w-lg mx-auto mb-12">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/40 mb-3">Pricing</div>
        <h2 className="font-sans font-black text-3xl md:text-[2.75rem] leading-[1.02] tracking-tight text-ink mb-3">
          Simple pricing that grows with you.
        </h2>
        <p className="text-sm md:text-base text-ink/55 max-w-sm mx-auto">Start free. Upgrade when your client list outgrows it — not before.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-5">
        {order.map((key, index) => {
          const plan = PLANS[key];
          const isPro = key === "PRO";
          return (
            <RevealOnScroll key={key} delay={index * 100}>
            <div
              className={cn(
                "relative rounded-2xl border p-7 bg-white flex flex-col h-full transition-all duration-300 hover:-translate-y-1.5 hover:shadow-popover",
                isPro ? "border-accent shadow-[0_8px_32px_-8px_rgba(240,82,77,0.28)] sm:scale-[1.04]" : "border-border"
              )}
            >
              {isPro && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wide text-white bg-accent rounded-full px-2.5 py-1">
                  Most popular
                </span>
              )}
              <h3 className="font-sans font-black text-xl tracking-tight text-ink">{plan.name}</h3>
              <p className="mt-2 text-4xl font-display text-ink">
                {plan.priceCents === 0 ? "Free" : formatMoney(plan.priceCents)}
                {plan.priceCents > 0 && <span className="text-sm font-sans text-ink/45">/mo</span>}
              </p>
              <p className="mt-2 text-xs text-ink/50">{plan.tagline}</p>
              <ul className="mt-5 space-y-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="text-xs text-ink/65 flex items-start gap-1.5">
                    <span className="text-success mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <LinkButton
                href="/signup"
                size="sm"
                variant={isPro ? "primary" : "outline"}
                className="w-full mt-6 rounded-full font-bold transition-transform duration-150 hover:scale-[1.04] active:scale-[0.96]"
              >
                {key === "FREE" ? "Start Free" : `Start with ${plan.name}`}
              </LinkButton>
            </div>
            </RevealOnScroll>
          );
        })}
      </div>

      <p className="text-center text-xs text-ink/40 mt-8">No credit card required to start. Cancel anytime.</p>
    </section>
  );
}
