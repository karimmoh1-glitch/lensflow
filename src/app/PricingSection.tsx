"use client";

import { useState } from "react";
import Link from "next/link";
import { PLANS, VISIBLE_PLANS, type PlanKey } from "@/lib/billing";
import { formatMoney, cn } from "@/lib/utils";
import { RevealOnScroll } from "./RevealOnScroll";
import { ValueLadder } from "./landing/ValueLadder";

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

export function PricingSection({ trial = false }: { trial?: boolean }) {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const price = (cents: number) => (interval === "year" ? cents * 10 : cents);
  return (
    <section className="px-6 py-20 md:py-28 max-w-[1200px] mx-auto">
      <ValueLadder />
      <div className="max-w-2xl mb-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65 mb-4">Pricing</p>
        <h2 className="font-sans font-extrabold text-[clamp(2.4rem,5vw,4.25rem)] leading-[0.94] tracking-[-0.045em] text-ink">Start free. Step up when it&rsquo;s obvious.</h2>
      </div>
      <div role="group" aria-label="Billing interval" className="mb-8 inline-flex items-center h-10 rounded-full border border-border bg-white p-0.5">
        {(["month", "year"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setInterval(v)} aria-pressed={interval === v} className={cn("inline-flex items-center h-9 px-4 rounded-full text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50", interval === v ? "bg-ink text-white" : "text-ink/70 hover:text-ink")}>
            {v === "month" ? "Monthly" : "Yearly"}{v === "year" && <span className={cn("ml-2 text-[10px] font-extrabold uppercase tracking-wide rounded-full px-1.5 py-0.5", interval === v ? "bg-white/15 text-white" : "bg-success-soft text-success-text")}>2 months free</span>}
          </button>
        ))}
      </div>
      <div className="grid md:grid-cols-3 gap-4 md:gap-5 items-stretch">
        {VISIBLE_PLANS.map((key, i) => {
          const plan = PLANS[key];
          const l = LADDER[key];
          const pro = key === "PRO";
          return (
            <RevealOnScroll key={key} delay={i * 90} className="h-full">
              <div className={cn("relative h-full rounded-[22px] border p-6 md:p-7 flex flex-col transition-all duration-300 hover:-translate-y-1", pro ? "border-accent bg-white shadow-[0_24px_60px_-24px_rgba(240,82,77,0.45)]" : "border-border bg-white hover:shadow-popover")}>
                {l.badge && <span className={cn("absolute -top-3 left-6 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white rounded-full px-2.5 py-1", pro ? "bg-accent-strong" : "bg-ink")}>{l.badge}</span>}
                <div className="text-sm font-semibold text-ink/70 leading-snug min-h-[2.5rem]">{l.who}</div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-sans font-extrabold text-4xl tracking-[-0.04em] text-ink">{plan.priceCents === 0 ? "Free" : formatMoney(price(plan.priceCents))}</span>
                  {plan.priceCents > 0 && <span className="text-sm text-ink/65">/ {interval === "year" ? "year" : "month"}</span>}
                </div>
                {plan.priceCents > 0 && interval === "year" && <p className="mt-1 text-xs font-semibold text-success-text">{formatMoney(plan.priceCents * 10 / 12)} a month, billed yearly</p>}
                <div className="mt-1 text-lg font-extrabold tracking-tight text-ink">{plan.name}</div>
                <ul className="mt-5 space-y-2 flex-1">
                  {l.gets.map((g) => (
                    <li key={g} className="flex items-start gap-2.5 text-sm text-ink/75"><span className={cn("mt-[7px] w-1.5 h-1.5 rounded-full shrink-0", pro ? "bg-accent" : "bg-ink/40")} />{g}</li>
                  ))}
                </ul>
                {l.why && <p className="mt-5 text-xs text-ink/70 leading-relaxed">{l.why}</p>}
                {pro && trial && <p className="mt-3 text-xs font-semibold text-ink leading-relaxed">7-day free trial · card required · first charge on day 8 · cancel before then and pay nothing.</p>}
                <Link
                  href="/signup"
                  className={cn("mt-6 inline-flex items-center justify-center h-11 rounded-full text-sm font-extrabold transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50", pro ? "bg-accent-strong text-white" : "bg-ink text-white")}
                >
                  {key === "FREE" ? "Start free" : `Start free, then ${plan.name}`}
                </Link>
              </div>
            </RevealOnScroll>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-ink/65">No card to start. Cancel anytime. Your Daythread plan is the only thing you ever pay for here — Daythread never handles payments between you and your customers.</p>
    </section>
  );
}
