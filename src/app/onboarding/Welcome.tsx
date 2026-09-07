"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { completeOnboarding } from "@/app/actions/onboarding";
import { ChannelIcon, type ChannelKey } from "@/app/landing/ChannelIcon";
import { DaythreadLogo } from "@/components/brand/DaythreadLogo";
import type { IntegrationProvider } from "@prisma/client";

export type ChannelOption = { provider: IntegrationProvider; name: string; connected: boolean; available: boolean; note: string | null };
const ICON: Partial<Record<IntegrationProvider, ChannelKey>> = { EMAIL: "gmail", INSTAGRAM: "instagram", WHATSAPP: "whatsapp", SMS: "sms" };
const BLURB: Partial<Record<IntegrationProvider, string>> = {
  EMAIL: "Your inbox, read and replied to from here.",
  INSTAGRAM: "DMs to your professional account.",
  WHATSAPP: "WhatsApp Business messages, with receipts.",
  SMS: "A dedicated number for texts.",
};

export function Welcome({
  firstName,
  step,
  channels,
  connectedCount,
  justConnected,
  connectError,
  connectGmail,
  connectInstagram,
  connectWhatsApp,
}: {
  firstName: string;
  step: "welcome" | "connect";
  channels: ChannelOption[];
  connectedCount: number;
  justConnected: string | null;
  connectError: string | null;
  connectGmail: () => Promise<void>;
  connectInstagram: () => Promise<void>;
  connectWhatsApp: () => Promise<void>;
}) {
  const [view, setView] = useState<"welcome" | "connect">(step);
  const [pending, start] = useTransition();
  const [opening, setOpening] = useState<IntegrationProvider | null>(null);
  const [tz, setTz] = useState<string | undefined>(undefined);
  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      setTz(undefined);
    }
  }, []);
  useEffect(() => setView(step), [step]);

  const finish = () => start(() => completeOnboarding({ timezone: tz, connected: connectedCount }));
  const actionFor = (p: IntegrationProvider) => (p === "EMAIL" ? connectGmail : p === "INSTAGRAM" ? connectInstagram : p === "WHATSAPP" ? connectWhatsApp : null);

  return (
    <main className="min-h-screen bg-paper flex flex-col">
      <header className="px-6 pt-6 md:pt-8 flex items-center justify-between max-w-2xl w-full mx-auto">
        <DaythreadLogo />
        <ol className="flex items-center gap-1.5" aria-label="Progress">
          {(["welcome", "connect"] as const).map((s) => (
            <li key={s} aria-current={view === s ? "step" : undefined} className={cn("h-1.5 rounded-full transition-all duration-300", view === s ? "w-6 bg-ink" : "w-1.5 bg-ink/20")} />
          ))}
        </ol>
      </header>

      <div className="flex-1 flex items-center">
        <div className="w-full max-w-2xl mx-auto px-6 py-10 md:py-14">
          {view === "welcome" ? (
            <section className="dt-swap" aria-labelledby="welcome-title">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45">Welcome</p>
              <h1 id="welcome-title" className="mt-3 font-sans font-extrabold text-[2.2rem] md:text-[3rem] leading-[1] tracking-[-0.04em] text-ink text-balance">Hi {firstName}. Your inbox is ready.</h1>
              <p className="mt-4 text-base md:text-lg text-ink/65 leading-relaxed max-w-lg">Every message from every channel you connect lands in one place, sorted so the people waiting on you come first. Nothing arrives until you connect a channel — that&rsquo;s the next step.</p>
              <ul className="mt-8 grid sm:grid-cols-3 gap-3">
                {[["Connect", "Gmail, Instagram, WhatsApp or a text number, with the provider's own sign-in."], ["Read", "One list, newest first. Automated and promotional mail is kept out of the way."], ["Reply", "From the same address or account the message came from."]].map(([t, b]) => (
                  <li key={t} className="rounded-2xl border border-border bg-white px-4 py-3.5">
                    <div className="text-sm font-extrabold text-ink">{t}</div>
                    <div className="mt-1 text-xs text-ink/60 leading-relaxed">{b}</div>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Button size="lg" onClick={() => setView("connect")}>Connect a channel <ArrowRight className="w-4 h-4 ml-1" strokeWidth={2.5} aria-hidden /></Button>
                <button type="button" onClick={finish} disabled={pending} className="text-sm font-semibold text-ink/55 hover:text-ink disabled:opacity-50">{pending ? "Opening your inbox…" : "Skip for now"}</button>
              </div>
            </section>
          ) : (
            <section className="dt-swap" aria-labelledby="connect-title">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45">Step 2 of 2</p>
              <h1 id="connect-title" className="mt-3 font-sans font-extrabold text-[2rem] md:text-[2.6rem] leading-[1.02] tracking-[-0.04em] text-ink text-balance">Connect your first channel.</h1>
              <p className="mt-3 text-base text-ink/65 leading-relaxed max-w-lg">Each one opens the provider&rsquo;s own sign-in and brings you back here. You can add more, or disconnect any of them, under Settings.</p>
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
                    <li key={c.provider} className={cn("rounded-2xl border bg-white px-4 py-3.5 flex items-center gap-3.5 transition-colors", c.connected ? "border-success/40" : "border-border")}>
                      <span className="shrink-0 w-10 h-10 rounded-xl border border-border bg-paper flex items-center justify-center">{icon && <ChannelIcon k={icon} size={24} />}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-ink">{c.name}</div>
                        <div className="text-xs text-ink/55">{c.note ?? BLURB[c.provider]}</div>
                      </div>
                      {c.connected ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-success-text"><Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />Connected</span>
                      ) : c.provider === "SMS" ? (
                        c.available ? <Link href="/dashboard/settings?tab=channels" className="text-xs font-semibold text-ink/60 hover:text-ink whitespace-nowrap">Pick a number in Settings →</Link> : null
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
                <button type="button" onClick={() => setView("welcome")} className="text-sm font-semibold text-ink/55 hover:text-ink">Back</button>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
