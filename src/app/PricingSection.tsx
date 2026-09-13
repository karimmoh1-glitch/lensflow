"use client";

import { useState } from "react";
import Link from "next/link";
import { PLANS, VISIBLE_PLANS, BETA_PRO_DAYS, planPurchasable, type PlanKey } from "@/lib/billing";
import { formatMoney, cn } from "@/lib/utils";
import { RevealOnScroll } from "./RevealOnScroll";

/**
 * Three plans in one glance: who each is for, the price, four things you get, and why
 * you'd step up. Prices and limits come from the real plan table so marketing can never
 * drift from what is enforced.
 */
const LADDER: Record<PlanKey, { who: string; why?: string; gets: string[]; badge?: string }> = {
  FREE: {
    who: "I can manage my inbox.",
    gets: ["2 connected channels or calendars", "One inbox, sorted by who's waiting on you", "Calendar, bookings and 3 automations", "Just you"],
  },
  PRO: {
    who: "Daythread helps me manage my work.",
    why: "Every place people write, on one thread — with a text number, AI on every conversation, and an assistant that puts the day's work in front of you.",
    gets: ["All channels — Gmail, Instagram, WhatsApp, SMS — and both calendars", "A dedicated text number, AI summaries and reply drafts", "The assistant: replies, confirmations and follow-ups, with your approval", "Unlimited automations · up to 5 people on one inbox"],
    badge: "7-day trial",
  },
  BUSINESS: {
    who: "Daythread helps run my business.",
    why: "For businesses that depend on the inbox: the whole picture every morning, an assistant with three times the capacity, and a bigger team.",
    gets: ["Everything in Pro", "Business-wide view: what's at risk, who owns what, what's first", "60 approved assistant actions an hour, with business memory", "Up to 10 people, roles, internal notes, priority support"],
    badge: "Runs the business",
  },
};

export function PricingSection({ trial = false, beta = false }: { trial?: boolean; beta?: boolean }) {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const price = (cents: number) => (interval === "year" ? cents * 10 : cents);
  return (
    <section className="px-6 py-20 md:py-28 max-w-[1200px] mx-auto">
      <div className="max-w-2xl mb-8">
        <h2 className="font-sans font-bold text-[clamp(2.1rem,4.2vw,3.4rem)] leading-[1] tracking-[-0.04em] text-ink">{beta ? <>Pro is free for a month.</> : <>Start free. Step up when it&rsquo;s obvious.</>}</h2>
        {beta && <p className="mt-4 text-[1.0625rem] text-ink/60">Daythread is in beta, so every new account gets Pro free for {BETA_PRO_DAYS} days. No card.</p>}
      </div>
      <div role="group" aria-label="Billing interval" className="mb-8 inline-flex items-center rounded-lg bg-black/[0.045] p-0.5">
        {(["month", "year"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setInterval(v)} aria-pressed={interval === v} className={cn("inline-flex items-center h-8 px-3.5 rounded-md text-13 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70", interval === v ? "bg-white text-ink shadow-xs" : "text-ink/60 hover:text-ink")}>
            {v === "month" ? "Monthly" : "Yearly"}{v === "year" && <span className={cn("ml-2 text-2xs font-semibold rounded px-1.5 py-0.5", "bg-success-soft text-success-text")}>2 months free</span>}
          </button>
        ))}
      </div>
      <div className="grid md:grid-cols-3 gap-4 md:gap-5 items-stretch">
        {VISIBLE_PLANS.map((key, i) => {
          const plan = PLANS[key];
          const l = LADDER[key];
          const pro = key === "PRO";
          const unavailable = key !== "FREE" && !planPurchasable(key);
          const betaPro = pro && beta;
          const badge = unavailable ? "Temporarily unavailable" : betaPro ? "Free for 1 month · beta" : l.badge;
          return (
            <RevealOnScroll key={key} delay={i * 90} className="h-full">
              <div className={cn("relative h-full rounded-2xl border p-6 md:p-7 flex flex-col", unavailable ? "border-border bg-paper" : pro ? "border-ink/80 bg-white shadow-[0_24px_60px_-32px_rgba(16,17,20,0.45)]" : "border-border bg-white")} aria-disabled={unavailable || undefined}>
                {badge && <span className={cn("absolute -top-2.5 left-6 text-xs font-semibold rounded-md px-2 py-0.5", pro ? "bg-accent-strong text-white" : unavailable ? "bg-black/[0.06] text-ink/60" : "bg-ink text-white")}>{badge}</span>}
                <div className="text-lg font-semibold tracking-[-0.01em] text-ink">{plan.name}</div>
                <div className="mt-0.5 text-13 text-ink/60 leading-snug min-h-[2.5rem]">{l.who}</div>
                <div className={cn("mt-4 flex items-baseline gap-1.5", unavailable && "opacity-60")}>
                  {betaPro ? (
                    <>
                      <span className="font-sans font-bold text-4xl tracking-[-0.04em] text-ink">Free</span>
                      <span className="text-sm text-ink/65">for 1 month, then {formatMoney(price(plan.priceCents))} / {interval === "year" ? "year" : "month"}</span>
                    </>
                  ) : (
                    <>
                      <span className="font-sans font-bold text-4xl tracking-[-0.04em] text-ink">{formatMoney(price(plan.priceCents))}</span>
                      <span className="text-sm text-ink/60">{plan.priceCents > 0 ? `/ ${interval === "year" ? "year" : "month"}` : "forever"}</span>
                    </>
                  )}
                </div>
                {plan.priceCents > 0 && interval === "year" && !unavailable && <p className="mt-1 text-xs font-semibold text-success-text">{formatMoney(plan.priceCents * 10 / 12)} a month, billed yearly</p>}
                <ul className="mt-5 space-y-2 flex-1">
                  {l.gets.map((g) => (
                    <li key={g} className="flex items-start gap-2.5 text-sm text-ink/70"><span className="mt-[8px] w-1 h-1 rounded-full shrink-0 bg-ink/40" />{g}</li>
                  ))}
                </ul>
                {pro && trial && !beta && <p className="mt-3 text-xs font-semibold text-ink leading-relaxed">7-day free trial · card required · first charge on day 8 · cancel before then and pay nothing.</p>}
                {betaPro && <p className="mt-5 text-xs text-ink/60 leading-relaxed">No card. When the month ends you stay on Free unless you choose Pro.</p>}
                {unavailable ? (
                  <span className="mt-6 inline-flex items-center justify-center h-11 rounded-xl text-sm font-bold bg-black/5 text-ink/60 cursor-not-allowed select-none">Temporarily unavailable</span>
                ) : (
                  <Link
                    href="/start"
                    className={cn("mt-6 inline-flex items-center justify-center h-11 rounded-xl text-sm font-semibold transition-[background-color,transform] duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2", pro ? "bg-ink text-white hover:bg-black" : "border border-ink/[0.14] bg-white text-ink hover:border-ink/30")}
                  >
                    {key === "FREE" ? "Start free" : betaPro ? "Claim 1 month of Pro free" : `Start free, then ${plan.name}`}
                  </Link>
                )}
              </div>
            </RevealOnScroll>
          );
        })}
      </div>
      <p className="mt-6 text-13 text-ink/60">No card to start. Cancel any time. Daythread doesn&rsquo;t collect payments from your clients.</p>
    </section>
  );
}
