import Link from "next/link";
import { PLANS, type PlanKey } from "@/lib/billing";
import { formatMoney, cn } from "@/lib/utils";
import { RevealOnScroll } from "./RevealOnScroll";
import { ValueLadder } from "./landing/ValueLadder";

/**
 * The value ladder in one glance: who each plan is for, the price, four things you get,
 * and why you'd step up. Prices come from the real plan table so marketing can never
 * drift from billing.
 */
const LADDER: Record<PlanKey, { who: string; why?: string; gets: string[] }> = {
  FREE: {
    who: "Just you, getting organized.",
    gets: ["Unlimited clients & bookings", "Email + website inbox", "Booking page & deposits", "Payment tracking"],
  },
  PRO: {
    who: "You, with real momentum.",
    why: "When leads come from everywhere and reminders are eating your evenings.",
    gets: ["Instagram, SMS & Messenger inbox", "Automations that run themselves", "AI-drafted replies", "Client timelines & lead scores"],
  },
  BUSINESS: {
    who: "You and a small team.",
    why: "When more than one person answers the phone.",
    gets: ["Everything in Pro", "Team seats & roles", "Shared inbox assignment", "Priority support"],
  },
};

export function PricingSection() {
  const order: PlanKey[] = ["FREE", "PRO", "BUSINESS"];
  return (
    <section className="px-6 py-20 md:py-28 max-w-[1200px] mx-auto">
      <ValueLadder />
      <div className="max-w-2xl mb-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mb-4">Pricing</p>
        <h2 className="font-sans font-extrabold text-[clamp(2.4rem,5vw,4.25rem)] leading-[0.94] tracking-[-0.045em] text-ink">Start free. Upgrade when it&rsquo;s obvious.</h2>
      </div>
      <div className="grid md:grid-cols-3 gap-4 md:gap-5 items-stretch">
        {order.map((key, i) => {
          const plan = PLANS[key];
          const l = LADDER[key];
          const pro = key === "PRO";
          return (
            <RevealOnScroll key={key} delay={i * 90} className="h-full">
              <div className={cn("relative h-full rounded-[22px] border p-6 md:p-7 flex flex-col transition-all duration-300 hover:-translate-y-1", pro ? "border-accent bg-white shadow-[0_24px_60px_-24px_rgba(240,82,77,0.45)]" : "border-border bg-white hover:shadow-popover")}>
                {pro && <span className="absolute -top-3 left-6 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white bg-accent rounded-full px-2.5 py-1">Most people</span>}
                <div className="text-sm font-semibold text-ink/55">{l.who}</div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-sans font-extrabold text-4xl tracking-[-0.04em] text-ink">{plan.priceCents === 0 ? "Free" : formatMoney(plan.priceCents)}</span>
                  {plan.priceCents > 0 && <span className="text-sm text-ink/50">/ month</span>}
                </div>
                <div className="mt-1 text-lg font-extrabold tracking-tight text-ink">{plan.name}</div>
                <ul className="mt-5 space-y-2 flex-1">
                  {l.gets.map((g) => (
                    <li key={g} className="flex items-start gap-2.5 text-sm text-ink/75"><span className={cn("mt-[7px] w-1.5 h-1.5 rounded-full shrink-0", pro ? "bg-accent" : "bg-ink/40")} />{g}</li>
                  ))}
                </ul>
                {l.why && <p className="mt-5 text-xs text-ink/55 leading-relaxed">{l.why}</p>}
                <Link
                  href="/signup"
                  className={cn("mt-6 inline-flex items-center justify-center h-11 rounded-full text-sm font-extrabold transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50", pro ? "bg-accent text-white" : "bg-ink text-white")}
                >
                  {key === "FREE" ? "Start free" : `Start with ${plan.name}`}
                </Link>
              </div>
            </RevealOnScroll>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-ink/45">No card to start. Cancel anytime.</p>
    </section>
  );
}
