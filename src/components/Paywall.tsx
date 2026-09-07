"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { PAYWALLS, type PaywallFeature } from "@/lib/paywall";
import { recordPaywallEvent } from "@/app/actions/paywall";
import { startUpgradeCheckout } from "@/app/actions/billing";
import { useToast } from "@/components/Toaster";
import { cn } from "@/lib/utils";

/**
 * The paywall: one dialog, copy keyed on the exact feature someone reached for, one
 * dominant call to action, a way out. It never blocks the core product — it appears only
 * when a paid capability is attempted — and it never hides the terms: the price, the
 * interval, the trial's first-charge date and cancellation are all on it.
 *
 * `billingLive` decides what the button does: start checkout (with the trial when the
 * workspace still has it) or, on a deployment without Stripe, open the subscription page
 * that says upgrades aren't open yet. Nothing here changes a plan; Stripe's webhook does.
 */
type Config = { plan: "FREE" | "PRO" | "BUSINESS"; billingLive: boolean; trialOffered: boolean; canBill: boolean; prices: { PRO: number; BUSINESS: number } };
type Ctx = { open: (feature: PaywallFeature, source: string) => void; config: Config };
const PaywallContext = createContext<Ctx | null>(null);

export function usePaywall() {
  const ctx = useContext(PaywallContext);
  return ctx;
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(0)}`;

export function PaywallProvider({ config, children }: { config: Config; children: ReactNode }) {
  const [state, setState] = useState<{ feature: PaywallFeature; source: string } | null>(null);
  const open = useCallback((feature: PaywallFeature, source: string) => setState({ feature, source }), []);
  const value = useMemo(() => ({ open, config }), [open, config]);
  return (
    <PaywallContext.Provider value={value}>
      {children}
      {state && <PaywallDialog feature={state.feature} source={state.source} config={config} onClose={() => setState(null)} />}
    </PaywallContext.Provider>
  );
}

function PaywallDialog({ feature, source, config, onClose }: { feature: PaywallFeature; source: string; config: Config; onClose: () => void }) {
  const copy = PAYWALLS[feature];
  const plan = copy.plan;
  const price = config.prices[plan];
  const trial = plan === "PRO" && config.trialOffered;
  const [pending, startTransition] = useTransition();
  const [redirecting, setRedirecting] = useState(false);
  const { toast } = useToast();
  const firstCharge = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  useEffect(() => {
    void recordPaywallEvent("paywall_shown", feature, source);
  }, [feature, source]);

  const dismiss = () => {
    void recordPaywallEvent("paywall_dismissed", feature, source);
    onClose();
  };

  const go = () => {
    void recordPaywallEvent("paywall_cta", feature, source);
    startTransition(async () => {
      const result = await startUpgradeCheckout(plan, "month", undefined, { trial, source: `paywall:${feature}:${source}` });
      if (result.url) {
        setRedirecting(true);
        window.location.href = result.url;
        return;
      }
      if (result.changed) {
        toast({ tone: "outcome", title: "Plan change accepted", body: "Stripe is applying it now — your plan updates within seconds." });
        onClose();
        return;
      }
      toast({ tone: "signal", title: "Couldn't start the upgrade", body: result.error ?? "Something went wrong." });
    });
  };

  return (
    <BottomSheet open onClose={dismiss} title={`Daythread ${plan === "PRO" ? "Pro" : "Business"}`} subtitle={copy.eyebrow} icon={<Sparkles className="w-4 h-4" strokeWidth={2} aria-hidden />} size="lg">
      <div className="px-5 pb-6 pt-1 sm:px-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">{copy.eyebrow}</p>
        <h2 className="mt-2 font-sans font-extrabold text-[1.9rem] sm:text-[2.3rem] leading-[0.98] tracking-[-0.04em] text-ink text-balance">{copy.title}</h2>
        <p className="mt-3 text-[15px] text-ink/70 leading-relaxed max-w-lg">{copy.lede}</p>

        <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {copy.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5 rounded-xl border border-border bg-paper px-3.5 py-3 text-sm text-ink">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-success text-white flex items-center justify-center shrink-0"><Check className="w-3 h-3" strokeWidth={3} aria-hidden /></span>
              <span className="leading-snug">{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-2xl border border-border bg-white px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <div className="font-sans font-extrabold text-2xl tracking-[-0.03em] text-ink tabular-nums">
              {trial ? <><span className="text-success-text">7 days free</span><span className="text-ink/60 text-base font-semibold">, then {fmt(price)}/month</span></> : <>{fmt(price)}<span className="text-ink/60 text-base font-semibold">/month</span></>}
            </div>
            <p className="mt-1 text-xs text-ink/70 leading-relaxed">
              {trial ? `Card required. No charge today; the first charge of ${fmt(price)} is on ${firstCharge}. Cancel before then and you pay nothing.` : `Or ${fmt(price * 10)} a year — two months free. Cancel any time from Settings → Subscription; you keep the plan until the period ends.`}
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex flex-col items-stretch gap-2 shrink-0 sm:w-56">
            {config.billingLive && config.canBill ? (
              <button type="button" onClick={go} disabled={pending || redirecting} className="inline-flex items-center justify-center h-11 px-5 rounded-full bg-accent-strong text-white text-sm font-extrabold shadow-[0_10px_28px_-10px_rgba(240,82,77,0.7)] hover:brightness-95 active:scale-[0.98] transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                {redirecting ? "Taking you to Stripe…" : pending ? "One moment…" : trial ? "Start your 7-day Pro trial" : `Upgrade to ${plan === "PRO" ? "Pro" : "Business"}`}
              </button>
            ) : (
              <Link href="/dashboard/settings?tab=subscription" onClick={() => void recordPaywallEvent("paywall_cta", feature, source)} className="inline-flex items-center justify-center h-11 px-5 rounded-full bg-ink text-white text-sm font-extrabold hover:bg-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                See {plan === "PRO" ? "Pro" : "Business"}
              </Link>
            )}
            <button type="button" onClick={dismiss} className="inline-flex items-center justify-center h-9 text-sm font-semibold text-ink/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-full">Not now</button>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-ink/65">Your conversations, contacts and bookings stay exactly as they are whatever you choose. Daythread only ever bills its own subscription.</p>
      </div>
    </BottomSheet>
  );
}

/** A button that opens the paywall for one feature. Use inside any client or server tree under the provider. */
export function PaywallTrigger({ feature, source, children, className, variant = "primary" }: { feature: PaywallFeature; source: string; children: ReactNode; className?: string; variant?: "primary" | "link" }) {
  const ctx = usePaywall();
  const href = "/dashboard/settings?tab=subscription";
  const cls = cn(
    variant === "primary"
      ? "inline-flex items-center justify-center h-10 px-5 rounded-full bg-ink text-white text-sm font-bold hover:bg-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      : "inline-block text-xs font-bold text-signal-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded",
    className
  );
  if (!ctx) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button type="button" onClick={() => ctx.open(feature, source)} className={cls}>
      {children}
    </button>
  );
}
