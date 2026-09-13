"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button, FormError } from "@/components/ui";
import { cn } from "@/lib/utils";
import { completeOnboarding, markOnboardingDone, notePlanChoice, turnOnStarterAutomations } from "@/app/actions/onboarding";
import { startUpgradeCheckout } from "@/app/actions/billing";
import { ChannelIcon, type ChannelKey } from "@/app/landing/ChannelIcon";
import { DaythreadLogo } from "@/components/brand/DaythreadLogo";
import { list, type PlanKey } from "@/lib/personalization";
import { useToast } from "@/components/Toaster";
import type { IntegrationProvider } from "@prisma/client";

export type ChannelOption = { provider: IntegrationProvider; name: string; connected: boolean; available: boolean; wanted: boolean; note: string | null };
export type StarterRecipe = { key: string; label: string; when: string; template: string; on: boolean };
export type PersonalWelcome = {
  recommendedPlan: PlanKey;
  selectedPlan: PlanKey | null;
  reasons: string[];
  wantsCalendar: boolean;
  billingLive: boolean;
  trialOffered: boolean;
  canBill: boolean;
  /** Set while the workspace has the beta month of Pro and no subscription. */
  betaProEndsAt: string | null;
  businessUnavailable: boolean;
};
type ConnectAction = (formData: FormData) => Promise<void>;

const ICON: Partial<Record<IntegrationProvider, ChannelKey>> = { EMAIL: "gmail", INSTAGRAM: "instagram", WHATSAPP: "whatsapp", SMS: "sms" };
const BLURB: Partial<Record<IntegrationProvider, string>> = {
  EMAIL: "Your Gmail inbox, read and answered from here.",
  MICROSOFT_OUTLOOK: "Your Outlook inbox, answered from your own address.",
  INSTAGRAM: "DMs to your professional account.",
  WHATSAPP: "Your WhatsApp Business number.",
  SMS: "A dedicated number for texts.",
};
const VARIABLE_LABEL: Record<string, string> = { name: "client's name", service: "service", date: "date", time: "time" };
const planName = (p: PlanKey) => (p === "PRO" ? "Pro" : p === "BUSINESS" ? "Business" : "Free");

/**
 * The two steps after the account exists, in the order that keeps someone inside the flow:
 * first the follow-through (switched on here, no page change), then the channels (each
 * connect leaves for the provider's sign-in, so it is last, and it marks onboarding done
 * before leaving). Both end on Today, where the setup checklist carries on from the same
 * records. Nothing here is decorative: every toggle creates a real automation and every
 * connect button is the same provider sign-in as Settings.
 */
export function Welcome({
  firstName,
  businessName,
  step,
  channels,
  connectedCount,
  justConnected,
  connectError,
  recipes,
  personal,
  connect,
}: {
  firstName: string;
  businessName: string;
  step: "automate" | "connect";
  channels: ChannelOption[];
  connectedCount: number;
  justConnected: string | null;
  connectError: string | null;
  recipes: StarterRecipe[];
  personal: PersonalWelcome | null;
  connect: Partial<Record<IntegrationProvider, ConnectAction>>;
}) {
  const [view, setView] = useState<"automate" | "connect">(step);
  const [pending, start] = useTransition();
  const [opening, setOpening] = useState<IntegrationProvider | null>(null);
  const [tz, setTz] = useState<string>("");
  const [chosen, setChosen] = useState<string[]>(() => recipes.filter((r) => !r.on && (r.key === "confirm" || r.key === "remind")).map((r) => r.key));
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
      // The /start draft has done its job.
      localStorage.removeItem("dt-start:draft");
    } catch {}
  }, []);
  useEffect(() => setView(step), [step]);

  const finish = () => start(() => completeOnboarding({ timezone: tz || undefined, connected: connectedCount }));
  const wantedNames = channels.filter((c) => c.wanted && !c.connected).map((c) => c.name);
  const alreadyOn = recipes.filter((r) => r.on).length;

  const saveAutomations = () => {
    setError(null);
    if (chosen.length === 0) { setView("connect"); return; }
    start(async () => {
      const result = await turnOnStarterAutomations(chosen);
      if (!result.ok) { setError(result.error); return; }
      const total = result.created + result.existing;
      toast({ tone: "outcome", title: `${total} ${total === 1 ? "automation" : "automations"} on`, body: result.paused ?? "Change the wording any time under Automations." });
      setView("connect");
      window.scrollTo({ top: 0 });
    });
  };

  const startPlan = (plan: "PRO" | "BUSINESS") =>
    start(async () => {
      await notePlanChoice(plan);
      await markOnboardingDone({ timezone: tz || undefined, connected: connectedCount, via: "checkout" });
      const trial = plan === "PRO" && Boolean(personal?.trialOffered);
      const result = await startUpgradeCheckout(plan, "month", undefined, { trial, source: "onboarding" });
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      toast({ tone: "neutral", title: "Couldn't start the upgrade", body: result.error ?? "Something went wrong. You're on Free; try again from Settings → Subscription." });
    });

  return (
    <main className="min-h-screen bg-paper flex flex-col">
      <header className="px-5 md:px-8 pt-5 md:pt-7 max-w-2xl w-full mx-auto">
        <div className="flex items-center justify-between gap-4">
          <DaythreadLogo />
          <span className="text-xs font-semibold text-ink/65 tabular-nums">Step {view === "automate" ? 1 : 2} of 2</span>
        </div>
        <div className="mt-4 h-1 rounded-full bg-ink/10 overflow-hidden" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={2} aria-valuenow={view === "automate" ? 1 : 2}>
          <div className="h-full rounded-full bg-ink transition-[width] duration-500 motion-reduce:transition-none" style={{ width: view === "automate" ? "50%" : "100%" }} />
        </div>
      </header>

      <div className="flex-1 w-full max-w-2xl mx-auto px-5 md:px-8 pt-8 md:pt-12 pb-10">
        {view === "automate" ? (
          <section key="automate" className="dt-swap" aria-labelledby="automate-title">
            <p className="text-sm text-ink/60">Welcome, {firstName}.</p>
            <h1 id="automate-title" className="mt-1.5 font-sans font-bold text-[1.75rem] md:text-[2.25rem] leading-[1.05] tracking-[-0.035em] text-ink text-balance">Let the follow-through run itself.</h1>
            <p className="mt-2.5 text-[15px] text-ink/65 leading-relaxed max-w-lg">Switch on the messages every booking needs. Each one goes to the client on the channel they wrote from. Change the wording any time under Automations.</p>

            <fieldset className="mt-7">
              <legend className="sr-only">Automations to switch on</legend>
              <ul className="space-y-2.5">
                {recipes.map((r) => {
                  const checked = r.on || chosen.includes(r.key);
                  return (
                    <li key={r.key}>
                      <label className={cn("flex items-start gap-3.5 rounded-xl border bg-white px-4 py-3.5 shadow-surface transition-colors", r.on ? "border-border cursor-default" : "cursor-pointer hover:border-ink/25", checked && !r.on && "border-ink/40")}>
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-ink cursor-pointer disabled:cursor-default"
                          checked={checked}
                          disabled={r.on || pending}
                          onChange={(e) => setChosen((cur) => (e.target.checked ? [...cur, r.key] : cur.filter((k) => k !== r.key)))}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-semibold text-ink">{r.label}</span>
                            {r.on && <span className="inline-flex items-center gap-1 text-xs font-medium text-success-text shrink-0"><Check className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />Already on</span>}
                          </span>
                          <span className="block text-13 text-ink/55">{r.when}</span>
                          <span className="mt-2 block rounded-lg bg-paper px-3 py-2 text-13 text-ink/75 leading-relaxed">
                            <Template text={r.template} businessName={businessName} />
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            {error && <div className="mt-4"><FormError>{error}</FormError></div>}

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={saveAutomations} loading={pending} loadingLabel="Switching on">
                {chosen.length ? `Turn on ${chosen.length} and continue` : alreadyOn ? "Continue" : "Continue without these"} <ArrowRight className="w-4 h-4 ml-1" strokeWidth={2.5} aria-hidden />
              </Button>
            </div>

            {personal && <PlanBlock personal={personal} pending={pending} onStart={startPlan} onFree={() => void notePlanChoice("FREE")} />}
          </section>
        ) : (
          <section key="connect" className="dt-swap" aria-labelledby="connect-title">
            <h1 id="connect-title" className="font-sans font-bold text-[1.75rem] md:text-[2.25rem] leading-[1.05] tracking-[-0.035em] text-ink text-balance">Connect where clients message you.</h1>
            <p className="mt-2.5 text-[15px] text-ink/65 leading-relaxed max-w-lg">
              {wantedNames.length ? `You said clients reach you on ${list(wantedNames)}. ` : ""}Each opens the provider&rsquo;s own sign-in. New messages land in one inbox, and you reply from the same account.
              {personal?.wantsCalendar ? " Your calendar connects under Settings → Channels." : ""}
            </p>
            {justConnected && (
              <p role="status" className="mt-4 rounded-xl border border-success/30 bg-success-soft/50 px-4 py-3 text-sm text-success-text">Connected. Messages from it will start arriving in your inbox.</p>
            )}
            {connectError && (
              <p role="alert" className="mt-4 rounded-xl border border-warning/40 bg-warning-soft/60 px-4 py-3 text-sm text-ink/80">That connection didn&rsquo;t finish{connectError === "limit" ? " — your plan's channel limit is reached" : ""}. Nothing was saved; try again, or connect it later from Settings.</p>
            )}
            <ul className="mt-6 rounded-xl border border-border bg-white shadow-surface divide-y divide-border">
              {channels.map((c) => {
                const action = connect[c.provider];
                return (
                  <li key={c.provider} className="px-4 py-3.5 flex items-center gap-3.5">
                    <ProviderIcon provider={c.provider} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-ink">{c.name}{c.wanted && !c.connected && <span className="ml-2 text-xs font-medium text-ink/55">You use this</span>}</div>
                      <div className="text-13 text-ink/60">{c.note ?? BLURB[c.provider]}</div>
                    </div>
                    {c.connected ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success-text"><Check className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />Connected</span>
                    ) : c.provider === "SMS" ? (
                      c.available ? <Link href="/dashboard/settings?tab=channels" onClick={() => void markOnboardingDone({ timezone: tz || undefined, via: "connect" })} className="text-13 font-medium text-ink/70 hover:text-ink whitespace-nowrap">Pick a number</Link> : null
                    ) : action && c.available ? (
                      <form action={action} onSubmit={() => setOpening(c.provider)}>
                        <input type="hidden" name="timezone" value={tz} />
                        <Button type="submit" size="sm" variant={c.wanted ? "primary" : "secondary"} loading={opening === c.provider} loadingLabel="Opening">Connect</Button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={finish} loading={pending} loadingLabel="Opening Today">{connectedCount > 0 ? "Open Today" : "Continue to Today"} <ArrowRight className="w-4 h-4 ml-1" strokeWidth={2.5} aria-hidden /></Button>
              <Button size="lg" variant="ghost" onClick={() => setView("automate")} disabled={pending}>Back</Button>
            </div>
            <p className="mt-4 text-xs text-ink/55 max-w-md">Today keeps a short setup list — services and hours, your calendar, anything you skip here — until it&rsquo;s done.</p>
          </section>
        )}
      </div>
    </main>
  );
}

/** The recipe's real template, with the variables shown as what they'll become. */
function Template({ text, businessName }: { text: string; businessName: string }) {
  const parts = text.split(/(\{\{\s*[a-z]+\s*\}\})/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\{\{\s*([a-z]+)\s*\}\}$/);
        if (!m) return <span key={i}>{part}</span>;
        if (m[1] === "business") return <span key={i}>{businessName}</span>;
        return <span key={i} className="rounded bg-ink/[0.06] px-1 text-ink/60">{VARIABLE_LABEL[m[1]] ?? m[1]}</span>;
      })}
    </>
  );
}

function ProviderIcon({ provider }: { provider: IntegrationProvider }) {
  const icon = ICON[provider];
  if (icon) return <span className="shrink-0"><ChannelIcon k={icon} size={32} /></span>;
  if (provider === "MICROSOFT_OUTLOOK") return <span aria-hidden className="shrink-0 w-8 h-8 rounded-[9px] bg-[#0F6CBD] text-white text-sm font-bold flex items-center justify-center">O</span>;
  return <span aria-hidden className="shrink-0 w-8 h-8 rounded-[9px] bg-ink/[0.06]" />;
}

function PlanBlock({ personal, pending, onStart, onFree }: { personal: PersonalWelcome; pending: boolean; onStart: (plan: "PRO" | "BUSINESS") => void; onFree: () => void }) {
  const rec = personal.recommendedPlan;
  const chosen = personal.selectedPlan && personal.selectedPlan !== "FREE" ? personal.selectedPlan : null;
  const [dismissed, setDismissed] = useState(false);
  if ((rec === "FREE" && !chosen) || dismissed) return null;
  const wanted = (chosen ?? rec) as "PRO" | "BUSINESS";
  const plan: "PRO" | "BUSINESS" = wanted === "BUSINESS" && personal.businessUnavailable ? "PRO" : wanted;
  const trial = plan === "PRO" && personal.trialOffered;
  if (personal.betaProEndsAt) {
    const until = new Date(personal.betaProEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric" });
    return (
      <p className="mt-8 border-t border-border pt-5 text-13 text-ink/65 leading-relaxed">
        <span className="font-semibold text-ink">Pro is on until {until}.</span> Free while Daythread is in beta — no card, nothing to cancel.{wanted === "BUSINESS" && personal.businessUnavailable ? " Business is temporarily unavailable." : ""}
      </p>
    );
  }
  return (
    <div className="mt-8 border-t border-border pt-5">
      <p className="text-13 font-semibold text-ink">{chosen && chosen === plan ? `You chose ${planName(chosen)}` : `${planName(plan)} fits what you described`}</p>
      <p className="mt-1 text-13 text-ink/65 leading-relaxed">{personal.reasons[0]}</p>
      {personal.billingLive && personal.canBill ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => onStart(plan)} loading={pending} loadingLabel="One moment">{trial ? "Start the 7-day Pro trial" : `Start ${planName(plan)}`}</Button>
          <Button variant="ghost" onClick={() => { onFree(); setDismissed(true); }} disabled={pending}>Stay on Free</Button>
          <p className="basis-full text-xs text-ink/55">{trial ? "Card required. No charge today; cancel before day 8 and you pay nothing." : "Cancel any time from Settings → Subscription."}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink/55">{personal.billingLive ? "Ask the workspace owner to upgrade when you're ready." : "Upgrades aren't open on this deployment yet, so you're on Free."}</p>
      )}
    </div>
  );
}
