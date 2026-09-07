"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { completeOnboarding, markOnboardingDone, notePlanChoice } from "@/app/actions/onboarding";
import { startUpgradeCheckout } from "@/app/actions/billing";
import { ChannelIcon, type ChannelKey } from "@/app/landing/ChannelIcon";
import { DaythreadLogo, DaythreadMark } from "@/components/brand/DaythreadLogo";
import { PRIORITY_COPY, type Feature, type PlanKey } from "@/lib/personalization";
import { useToast } from "@/components/Toaster";
import type { IntegrationProvider } from "@prisma/client";

export type ChannelOption = { provider: IntegrationProvider; name: string; connected: boolean; available: boolean; wanted: boolean; note: string | null };
export type PersonalWelcome = {
  priorities: Feature[];
  recommendedPlan: PlanKey;
  selectedPlan: PlanKey | null;
  reasons: string[];
  buildSteps: string[];
  channelCount: number;
  wantsCalendar: boolean;
  billingLive: boolean;
  trialOffered: boolean;
  canBill: boolean;
};
const ICON: Partial<Record<IntegrationProvider, ChannelKey>> = { EMAIL: "gmail", INSTAGRAM: "instagram", WHATSAPP: "whatsapp", SMS: "sms" };
const BLURB: Partial<Record<IntegrationProvider, string>> = {
  EMAIL: "Your inbox, read and replied to from here.",
  INSTAGRAM: "DMs to your professional account.",
  WHATSAPP: "WhatsApp Business messages, with receipts.",
  SMS: "A dedicated number for texts.",
};
const planName = (p: PlanKey) => (p === "PRO" ? "Pro" : p === "BUSINESS" ? "Business" : "Free");

export function Welcome({
  firstName,
  workspaceKey,
  step,
  channels,
  connectedCount,
  justConnected,
  connectError,
  personal,
  connectGmail,
  connectInstagram,
  connectWhatsApp,
}: {
  firstName: string;
  workspaceKey: string;
  step: "welcome" | "connect";
  channels: ChannelOption[];
  connectedCount: number;
  justConnected: string | null;
  connectError: string | null;
  personal: PersonalWelcome | null;
  connectGmail: () => Promise<void>;
  connectInstagram: () => Promise<void>;
  connectWhatsApp: () => Promise<void>;
}) {
  const [view, setView] = useState<"build" | "welcome" | "connect">(step);
  const [pending, start] = useTransition();
  const [opening, setOpening] = useState<IntegrationProvider | null>(null);
  const [tz, setTz] = useState<string | undefined>(undefined);
  const { toast } = useToast();
  const buildKey = `dt-built:${workspaceKey}`;

  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
      // The /start draft has done its job.
      localStorage.removeItem("dt-start:draft");
    } catch {
      setTz(undefined);
    }
  }, []);
  useEffect(() => {
    // The building moment plays once per workspace, only when there is something to show.
    let built = true;
    try { built = sessionStorage.getItem(buildKey) === "1"; } catch {}
    setView(step === "welcome" && personal && !built ? "build" : step);
  }, [step, personal, buildKey]);

  const finish = () => start(() => completeOnboarding({ timezone: tz, connected: connectedCount }));
  const actionFor = (p: IntegrationProvider) => (p === "EMAIL" ? connectGmail : p === "INSTAGRAM" ? connectInstagram : p === "WHATSAPP" ? connectWhatsApp : null);
  const wantedNames = channels.filter((c) => c.wanted).map((c) => c.name);

  const startPlan = (plan: "PRO" | "BUSINESS") =>
    start(async () => {
      await notePlanChoice(plan);
      await markOnboardingDone({ timezone: tz, connected: connectedCount, via: "checkout" });
      const trial = plan === "PRO" && Boolean(personal?.trialOffered);
      const result = await startUpgradeCheckout(plan, "month", undefined, { trial, source: "onboarding" });
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      toast({ tone: "signal", title: "Couldn't start the upgrade", body: result.error ?? "Something went wrong. You're on Free; try again from Settings → Subscription." });
    });

  const stayFree = () => {
    void notePlanChoice("FREE");
    setView("connect");
  };

  return (
    <main className="min-h-screen bg-paper flex flex-col">
      <header className="px-6 pt-6 md:pt-8 flex items-center justify-between max-w-2xl w-full mx-auto">
        <DaythreadLogo />
        {view !== "build" && (
          <ol className="flex items-center gap-1.5" aria-label="Progress">
            {(["welcome", "connect"] as const).map((s) => (
              <li key={s} aria-current={view === s ? "step" : undefined} className={cn("h-1.5 rounded-full transition-all duration-300", view === s ? "w-6 bg-ink" : "w-1.5 bg-ink/20")} />
            ))}
          </ol>
        )}
      </header>

      <div className="flex-1 flex items-center">
        <div className="w-full max-w-2xl mx-auto px-6 py-10 md:py-14">
          {view === "build" && personal ? (
            <Building steps={personal.buildSteps} onDone={() => { try { sessionStorage.setItem(buildKey, "1"); } catch {} setView("welcome"); }} />
          ) : view === "welcome" ? (
            <section className="dt-swap" aria-labelledby="welcome-title">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65">Welcome</p>
              {personal ? (
                <>
                  <h1 id="welcome-title" className="mt-3 font-sans font-extrabold text-[2.2rem] md:text-[3rem] leading-[1] tracking-[-0.04em] text-ink text-balance">Welcome, {firstName}.</h1>
                  <p className="mt-4 text-base md:text-lg text-ink/70 leading-relaxed max-w-lg">Your workspace is set up around the way you work.</p>
                  <p className="mt-8 text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65">Your priorities</p>
                  <ul className="mt-2.5 grid sm:grid-cols-2 gap-3">
                    {personal.priorities.map((f, i) => (
                      <li key={f} className={cn("rounded-2xl border px-4 py-3.5", i === 0 ? "border-accent/40 bg-accent-soft/40" : "border-border bg-white")}>
                        <div className="text-sm font-extrabold text-ink">{PRIORITY_COPY[f].title}</div>
                        <div className="mt-1 text-xs text-ink/70 leading-relaxed">{PRIORITY_COPY[f].blurb}</div>
                      </li>
                    ))}
                  </ul>
                  <PlanBlock personal={personal} pending={pending} onStart={startPlan} onFree={stayFree} />
                  <div className="mt-8 flex flex-wrap items-center gap-4">
                    <Button size="lg" onClick={() => setView("connect")}>{wantedNames.length ? `Connect ${wantedNames.slice(0, 2).join(" and ")}` : "Connect a channel"} <ArrowRight className="w-4 h-4 ml-1" strokeWidth={2.5} aria-hidden /></Button>
                    <button type="button" onClick={finish} disabled={pending} className="text-sm font-semibold text-ink/70 hover:text-ink disabled:opacity-50">{pending ? "Opening your inbox…" : "Skip for now"}</button>
                  </div>
                </>
              ) : (
                <>
                  <h1 id="welcome-title" className="mt-3 font-sans font-extrabold text-[2.2rem] md:text-[3rem] leading-[1] tracking-[-0.04em] text-ink text-balance">Hi {firstName}. Your inbox is ready.</h1>
                  <p className="mt-4 text-base md:text-lg text-ink/70 leading-relaxed max-w-lg">Every message from every channel you connect lands in one place, sorted so the people waiting on you come first. Nothing arrives until you connect a channel — that&rsquo;s the next step.</p>
                  <ul className="mt-8 grid sm:grid-cols-3 gap-3">
                    {[["Connect", "Gmail, Instagram, WhatsApp or a text number, with the provider's own sign-in."], ["Read", "One list, newest first. Automated and promotional mail is kept out of the way."], ["Reply", "From the same address or account the message came from."]].map(([t, b]) => (
                      <li key={t} className="rounded-2xl border border-border bg-white px-4 py-3.5">
                        <div className="text-sm font-extrabold text-ink">{t}</div>
                        <div className="mt-1 text-xs text-ink/65 leading-relaxed">{b}</div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-ink/65">Want Daythread set up around how you work? You can tell us any time under <Link href="/dashboard/settings?tab=profile" className="font-semibold text-ink hover:underline">Settings → Profile</Link>.</p>
                  <div className="mt-8 flex flex-wrap items-center gap-4">
                    <Button size="lg" onClick={() => setView("connect")}>Connect a channel <ArrowRight className="w-4 h-4 ml-1" strokeWidth={2.5} aria-hidden /></Button>
                    <button type="button" onClick={finish} disabled={pending} className="text-sm font-semibold text-ink/70 hover:text-ink disabled:opacity-50">{pending ? "Opening your inbox…" : "Skip for now"}</button>
                  </div>
                </>
              )}
            </section>
          ) : (
            <section className="dt-swap" aria-labelledby="connect-title">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65">Step 2 of 2</p>
              <h1 id="connect-title" className="mt-3 font-sans font-extrabold text-[2rem] md:text-[2.6rem] leading-[1.02] tracking-[-0.04em] text-ink text-balance">{wantedNames.length ? "Connect your customer channels." : "Connect your first channel."}</h1>
              <p className="mt-3 text-base text-ink/70 leading-relaxed max-w-lg">
                {wantedNames.length ? `You said customers reach you on ${wantedNames.join(", ")}. ` : ""}Each one opens the provider&rsquo;s own sign-in and brings you back here. You can add more, or disconnect any of them, under Settings.
                {personal?.wantsCalendar ? " Google Calendar connects under Settings → Channels too." : ""}
              </p>
              {justConnected && (
                <p role="status" className="mt-4 rounded-2xl border border-success/30 bg-success-soft/50 px-4 py-3 text-sm text-success-text">Connected. Messages from it will start arriving in your inbox.</p>
              )}
              {connectError && (
                <p role="alert" className="mt-4 rounded-2xl border border-warning/40 bg-warning-soft/60 px-4 py-3 text-sm text-ink/80">That connection didn&rsquo;t finish{connectError === "limit" ? " — your plan's channel limit is reached" : ""}. Nothing was saved; try again, or continue and connect it later from Settings.</p>
              )}
              <ul className="mt-6 space-y-3">
                {channels.map((c) => {
                  const action = actionFor(c.provider);
                  const icon = ICON[c.provider];
                  return (
                    <li key={c.provider} className={cn("rounded-2xl border bg-white px-4 py-3.5 flex items-center gap-3.5 transition-colors", c.connected ? "border-success/40" : c.wanted ? "border-ink/30" : "border-border")}>
                      <span className="shrink-0 w-10 h-10 rounded-xl border border-border bg-paper flex items-center justify-center">{icon && <ChannelIcon k={icon} size={24} />}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-ink">{c.name}{c.wanted && !c.connected && <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.12em] text-signal-text">You use this</span>}</div>
                        <div className="text-xs text-ink/70">{c.note ?? BLURB[c.provider]}</div>
                      </div>
                      {c.connected ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-success-text"><Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />Connected</span>
                      ) : c.provider === "SMS" ? (
                        c.available ? <Link href="/dashboard/settings?tab=channels" className="text-xs font-semibold text-ink/65 hover:text-ink whitespace-nowrap">Pick a number in Settings →</Link> : null
                      ) : action && c.available ? (
                        <form action={action} onSubmit={() => setOpening(c.provider)}>
                          <Button type="submit" size="sm" loading={opening === c.provider} loadingLabel="Opening">Connect</Button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Button size="lg" onClick={finish} loading={pending} loadingLabel="Opening your inbox">{connectedCount > 0 ? "Open my inbox" : "Continue without connecting"} <ArrowRight className="w-4 h-4 ml-1" strokeWidth={2.5} aria-hidden /></Button>
                <button type="button" onClick={() => setView("welcome")} className="text-sm font-semibold text-ink/70 hover:text-ink">Back</button>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * "Building your Daythread": the lines are the writes the server made when the profile was
 * saved, revealed one at a time. It is a moment, not a process — nothing is waited on.
 */
function Building({ steps, onDone }: { steps: string[]; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gap = reduced ? 150 : 520;
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach((_, i) => timers.push(setTimeout(() => setShown(i + 1), 350 + gap * i)));
    timers.push(setTimeout(onDone, 350 + gap * steps.length + (reduced ? 200 : 700)));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section aria-live="polite" aria-labelledby="build-title" className="dt-swap">
      <div className="flex items-center gap-3">
        <DaythreadMark className="w-8 h-8 motion-safe:animate-pulse" />
        <h1 id="build-title" className="font-sans font-extrabold text-[1.9rem] md:text-[2.4rem] leading-[1] tracking-[-0.04em] text-ink">Building your Daythread…</h1>
      </div>
      <ol className="mt-8 space-y-3 max-w-md">
        {steps.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-3 text-[15px] transition-[opacity,transform] duration-400 ease-out motion-reduce:transition-none", i < shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1")} aria-hidden={i >= shown}>
            <span className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0", i < shown ? "bg-success text-white" : "bg-ink/10")}><Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden /></span>
            <span className="text-ink/85">{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-xs text-ink/65">Each line is something already saved to your workspace from your answers. Nothing here is invented.</p>
    </section>
  );
}

function PlanBlock({ personal, pending, onStart, onFree }: { personal: PersonalWelcome; pending: boolean; onStart: (plan: "PRO" | "BUSINESS") => void; onFree: () => void }) {
  const rec = personal.recommendedPlan;
  const chosen = personal.selectedPlan && personal.selectedPlan !== "FREE" ? personal.selectedPlan : null;
  if (rec === "FREE" && !chosen) return null;
  const plan = (chosen ?? rec) as "PRO" | "BUSINESS";
  const trial = plan === "PRO" && personal.trialOffered;
  return (
    <div className="mt-6 rounded-[22px] border border-signal/25 bg-signal-soft/30 px-5 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">{chosen ? `You chose ${planName(chosen)}` : `We'd recommend ${planName(rec)}`}</p>
      <p className="mt-1.5 text-sm text-ink/80 leading-relaxed">{personal.reasons[0]}</p>
      {personal.billingLive && personal.canBill ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => onStart(plan)} loading={pending} loadingLabel="One moment">{trial ? "Start your 7-day Pro trial" : `Start ${planName(plan)}`}</Button>
          <button type="button" onClick={onFree} disabled={pending} className="text-sm font-semibold text-ink/70 hover:text-ink">Stay on Free for now</button>
          <p className="basis-full text-xs text-ink/65">{trial ? "Card required. No charge today; cancel before day 8 and you pay nothing." : "Cancel any time from Settings → Subscription."}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink/65">{personal.billingLive ? "Ask the workspace owner to upgrade when you're ready." : "Upgrades aren't open on this deployment yet, so you're on Free. This recommendation is kept under Settings → Subscription."}</p>
      )}
    </div>
  );
}
