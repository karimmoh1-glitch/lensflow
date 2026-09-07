"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button, Input, Field, FormError } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { DaythreadLogo } from "@/components/brand/DaythreadLogo";
import { OptionGrid } from "@/components/onboarding/OptionGrid";
import { signup } from "@/app/actions/auth";
import { recordOnboardingEvent } from "@/app/actions/onboardingEvents";
import { GOOGLE_SIGN_IN_MESSAGES } from "@/lib/googleSignInMessages";
import {
  USER_TYPES, WORK_CATEGORIES, BUSINESS_STATUSES, TEAM_SIZES, CHANNELS, PAIN_POINTS, FEATURES, TOOLS, BOOKINGS_ANSWERS, TEAM_USAGE,
  answersSchema, asksTeamSize, derivePersonalization, labelOf, PRIORITY_COPY, type AnswersDraft, type PlanKey, type Personalization,
} from "@/lib/personalization";
import { cn } from "@/lib/utils";

/**
 * The questions, in order. One idea per screen. A step with `when` only appears when the
 * answers so far make it relevant (team size only once someone else is involved). The
 * draft lives in localStorage and the position in the URL, so a refresh, the browser's
 * Back button and a closed tab all land the person where they were.
 */
type Draft = AnswersDraft & { selectedPlan?: PlanKey | null; startedAt?: number; skipped?: boolean };
type Field = Exclude<keyof AnswersDraft, "workDetail">;
type Step = { key: string; kind: "text" | "single" | "multi" | "summary" | "account"; eyebrow: string; title: string; hint?: string; field?: Field; options?: readonly (readonly [string, string])[]; columns?: 1 | 2 | 3; when?: (d: Draft) => boolean };

const STEPS: Step[] = [
  { key: "name", kind: "text", eyebrow: "First things first", title: "What should we call you?", field: "displayName" },
  { key: "user_type", kind: "single", eyebrow: "About you", title: "What do you do?", field: "userType", options: USER_TYPES },
  { key: "work", kind: "single", eyebrow: "About you", title: "What kind of work do you do?", hint: "Pick the closest. Or choose Other and tell us in a few words.", field: "workCategory", options: WORK_CATEGORIES },
  { key: "business_status", kind: "single", eyebrow: "Your setup", title: "Are you using Daythread for a business?", field: "businessStatus", options: BUSINESS_STATUSES, columns: 1 },
  { key: "channels", kind: "multi", eyebrow: "Your customers", title: "Where do your customers usually reach you?", hint: "Choose everything that applies.", field: "channels", options: CHANNELS },
  { key: "pain", kind: "multi", eyebrow: "Your day", title: "What takes the most time or causes the most stress?", hint: "Choose everything that applies.", field: "painPoints", options: PAIN_POINTS },
  { key: "features", kind: "multi", eyebrow: "Daythread", title: "What would you like Daythread to help you with?", hint: "Choose everything that applies. The rest stays a click away.", field: "desiredFeatures", options: FEATURES },
  { key: "tools", kind: "multi", eyebrow: "Today", title: "What are you using today?", hint: "Choose everything that applies.", field: "currentTools", options: TOOLS },
  { key: "bookings", kind: "single", eyebrow: "Bookings", title: "Do customers book appointments or services with you?", field: "bookings", options: BOOKINGS_ANSWERS, columns: 3 },
  { key: "team", kind: "single", eyebrow: "People", title: "Do you work with other people?", field: "teamUsage", options: TEAM_USAGE, columns: 3 },
  { key: "team_size", kind: "single", eyebrow: "People", title: "How many people are involved?", hint: "Including you.", field: "teamSize", options: TEAM_SIZES, columns: 2, when: (d) => asksTeamSize(d) },
  { key: "summary", kind: "summary", eyebrow: "Your Daythread", title: "Here's what we heard." },
  { key: "account", kind: "account", eyebrow: "Last step", title: "Create your account." },
];

const DRAFT_KEY = "dt-start:draft";
const ID_KEY = "dt-start:id";

function loadDraft(): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") as Draft;
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}
function saveDraft(d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {}
}
function anonymousId(): string | null {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}
function complete(step: Step, d: Draft): boolean {
  if (step.kind === "text") return Boolean(d.displayName?.trim());
  if (step.kind === "single") return Boolean(d[step.field as Field]);
  if (step.kind === "multi") return Array.isArray(d[step.field as Field]) && (d[step.field as Field] as string[]).length > 0;
  if (step.kind === "summary") return d.selectedPlan !== undefined;
  return false;
}
function visibleSteps(d: Draft) {
  return STEPS.filter((s) => !s.when || s.when(d));
}
function reachable(steps: Step[], d: Draft): number {
  const i = steps.findIndex((s) => !complete(s, d));
  return i === -1 ? steps.length - 1 : i;
}
const fmt = (cents: number) => `$${(cents / 100).toFixed(0)}`;
const planName = (p: PlanKey) => (p === "PRO" ? "Pro" : p === "BUSINESS" ? "Business" : "Free");

export function StartFlow(props: { google: boolean; billingLive: boolean; prices: { PRO: number; BUSINESS: number } }) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-paper" />}>
      <Flow {...props} />
    </Suspense>
  );
}

function Flow({ google, billingLive, prices }: { google: boolean; billingLive: boolean; prices: { PRO: number; BUSINESS: number } }) {
  const sp = useSearchParams();
  const [draft, setDraftState] = useState<Draft>({});
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  // Captured once: the URL is rewritten to the step position right after mount.
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const anon = useRef<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const advancing = useRef(false);
  const steps = useMemo(() => visibleSteps(draft), [draft]);
  const step = steps[Math.min(idx, steps.length - 1)];

  const event = useCallback((name: Parameters<typeof recordOnboardingEvent>[0]["name"], properties?: Parameters<typeof recordOnboardingEvent>[0]["properties"]) => {
    if (!anon.current) return;
    void recordOnboardingEvent({ name, anonymousId: anon.current, properties });
  }, []);

  const setDraft = useCallback((next: Draft) => {
    setDraftState(next);
    saveDraft(next);
  }, []);

  // Restore: draft from storage, position from the URL (never past the first unanswered question).
  useEffect(() => {
    const d = loadDraft();
    anon.current = anonymousId();
    const vis = visibleSteps(d);
    const max = reachable(vis, d);
    const google = sp.get("google");
    if (google) setGoogleError(google);
    try {
      const fromUrl = sp.get("ref");
      if (fromUrl && /^[a-z2-9]{8}$/.test(fromUrl)) localStorage.setItem("dt-ref", fromUrl);
      const stored = localStorage.getItem("dt-ref");
      if (stored && /^[a-z2-9]{8}$/.test(stored)) setRef(stored);
    } catch {}
    const fromUrl = google ? vis.length - 1 : Number(sp.get("s") ?? 0);
    const i = Math.max(0, Math.min(Number.isFinite(fromUrl) ? fromUrl : 0, max, vis.length - 1));
    if (!d.startedAt) {
      d.startedAt = Date.now();
      saveDraft(d);
      void recordOnboardingEvent({ name: "onboarding_started", anonymousId: anon.current ?? "", properties: { source: "start" } });
    }
    setDraftState(d);
    setIdx(i);
    setReady(true);
    window.history.replaceState({ s: i }, "", i ? `/start?s=${i}` : "/start");
    const onPop = (e: PopStateEvent) => {
      const s = (e.state as { s?: number } | null)?.s;
      if (typeof s === "number") setIdx(s);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback((next: number) => {
    setIdx(next);
    window.history.pushState({ s: next }, "", next ? `/start?s=${next}` : "/start");
    window.scrollTo({ top: 0, behavior: "auto" });
    requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
    advancing.current = false;
  }, []);

  const back = () => { if (idx > 0) go(idx - 1); };

  const answer = (field: Field, value: string) => {
    const next: Draft = { ...draft };
    if (step.kind === "multi") {
      const cur = (next[field] as string[] | undefined) ?? [];
      next[field] = (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]) as never;
      setDraft(next);
      return;
    }
    next[field] = value as never;
    setDraft(next);
    // Single choice moves on by itself — unless "Other" wants a word of explanation.
    if (step.kind === "single" && !(field === "workCategory" && value === "other") && !advancing.current) {
      advancing.current = true;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(() => continueFrom(next, value), reduced ? 0 : 220);
    }
  };

  const continueFrom = (d: Draft, single?: string) => {
    if (!complete(step, d)) return;
    if (step.kind !== "text") {
      const values = step.kind === "multi" ? ((d[step.field as Field] as string[]) ?? []) : [single ?? String(d[step.field as Field])];
      event("onboarding_question_answered", { step: step.key, values, count: values.length });
    } else {
      event("onboarding_question_answered", { step: step.key, count: 1 });
    }
    go(Math.min(idx + 1, visibleSteps(d).length - 1));
  };

  const choosePlan = (p: Personalization, selected: PlanKey) => {
    const next: Draft = { ...draft, selectedPlan: selected };
    setDraft(next);
    event("recommended_plan_selected", { recommendedPlan: p.recommendedPlan, selectedPlan: selected });
    event("personalization_completed", { recommendedPlan: p.recommendedPlan, selectedPlan: selected, seconds: draft.startedAt ? Math.min(36000, Math.round((Date.now() - draft.startedAt) / 1000)) : undefined });
    go(idx + 1);
  };

  const skip = () => {
    const next: Draft = { ...draft, skipped: true };
    setDraft(next);
    event("onboarding_skipped", { step: step.key });
    go(steps.length - 1);
  };

  const parsedAnswers = useMemo(() => answersSchema.safeParse(draft), [draft]);
  const personalization = parsedAnswers.success ? derivePersonalization(parsedAnswers.data) : null;
  const questionCount = steps.filter((s) => s.kind !== "summary" && s.kind !== "account").length;
  const questionNumber = steps.slice(0, idx + 1).filter((s) => s.kind !== "summary" && s.kind !== "account").length;
  const counter = step.kind === "summary" ? "Your Daythread" : step.kind === "account" ? "Last step" : `${questionNumber} of ${questionCount}`;

  if (!ready) return <main className="min-h-screen bg-paper" />;

  return (
    <main className="min-h-screen bg-paper flex flex-col">
      <header className="w-full max-w-2xl mx-auto px-5 md:px-8 pt-5 md:pt-7">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50" aria-label="Daythread home"><DaythreadLogo /></Link>
          <span className="text-xs font-semibold text-ink/65 tabular-nums">{counter}</span>
        </div>
        <div className="mt-4 h-1 rounded-full bg-ink/10 overflow-hidden" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={idx + 1}>
          <div className="h-full rounded-full bg-ink transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none" style={{ width: `${((idx + 1) / steps.length) * 100}%` }} />
        </div>
      </header>

      <div className="flex-1 w-full max-w-2xl mx-auto px-5 md:px-8 pt-8 md:pt-12 pb-6">
        <section key={step.key} className="dt-swap" aria-labelledby="start-title">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65">{step.eyebrow}</p>
          <h1 id="start-title" ref={titleRef} tabIndex={-1} className="mt-3 font-sans font-extrabold text-[1.9rem] md:text-[2.5rem] leading-[1.02] tracking-[-0.04em] text-ink text-balance focus:outline-none">{step.title}</h1>
          {step.hint && <p className="mt-3 text-[15px] text-ink/70 leading-relaxed max-w-lg">{step.hint}</p>}

          <div className="mt-7">
            {step.kind === "text" && (
              <form onSubmit={(e) => { e.preventDefault(); continueFrom(draft); }} className="max-w-sm">
                <Field id="displayName" label="Your first name, or what people call you">
                  <Input id="displayName" name="displayName" autoComplete="given-name" autoFocus placeholder="Alex" maxLength={80} required value={draft.displayName ?? ""} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
                </Field>
                <p className="mt-2 text-xs text-ink/65">We use it to greet you and to name your workspace. That&rsquo;s all.</p>
              </form>
            )}

            {(step.kind === "single" || step.kind === "multi") && step.field && step.options && (
              <>
                <OptionGrid label={step.title} options={step.options} value={draft[step.field] as string | string[] | undefined} onChange={(k) => answer(step.field as Field, k)} multi={step.kind === "multi"} columns={step.columns ?? 2} />
                {step.field === "workCategory" && draft.workCategory === "other" && (
                  <div className="mt-4 max-w-sm dt-swap">
                    <Field id="workDetail" label="What kind of work is it?">
                      <Input id="workDetail" autoFocus placeholder="Dog grooming, tutoring, a bakery…" maxLength={80} value={draft.workDetail ?? ""} onChange={(e) => setDraft({ ...draft, workDetail: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); continueFrom(draft); } }} />
                    </Field>
                  </div>
                )}
              </>
            )}

            {step.kind === "summary" && (personalization ? <Summary p={personalization} name={draft.displayName ?? ""} billingLive={billingLive} prices={prices} onChoose={(plan) => choosePlan(personalization, plan)} onShown={() => event("recommended_plan_shown", { recommendedPlan: personalization.recommendedPlan })} /> : <p className="text-sm text-ink/70">Answer the questions above and we&rsquo;ll set Daythread up around them.</p>)}

            {step.kind === "account" && <Account google={google} draft={draft} answersJson={parsedAnswers.success ? JSON.stringify(parsedAnswers.data) : null} anonymousId={anon.current} googleError={googleError} referral={ref} />}
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 z-10 border-t border-border bg-paper/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="w-full max-w-2xl mx-auto px-5 md:px-8 py-3 flex items-center justify-between gap-3">
          <button type="button" onClick={back} disabled={idx === 0} className="inline-flex items-center gap-1.5 h-11 px-3 -ml-3 rounded-full text-sm font-semibold text-ink/70 hover:text-ink disabled:opacity-0 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <ArrowLeft className="w-4 h-4" strokeWidth={2.5} aria-hidden />Back
          </button>
          {step.kind === "text" || step.kind === "single" || step.kind === "multi" ? (
            <Button size="lg" onClick={() => continueFrom(draft)} disabled={!complete(step, draft)} className="min-w-[9rem]">
              Continue <ArrowRight className="w-4 h-4 ml-1" strokeWidth={2.5} aria-hidden />
            </Button>
          ) : (
            <span className="text-xs text-ink/65">{step.kind === "summary" ? "Nothing is charged today." : "Free to start. No card."}</span>
          )}
        </div>
      </div>

      <footer className="w-full max-w-2xl mx-auto px-5 md:px-8 py-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-ink/65">
        <span>Already on Daythread? <Link href="/login" className="font-semibold text-ink hover:text-accent-text">Log in</Link></span>
        {step.kind !== "account" && step.kind !== "summary" && (
          <button type="button" onClick={skip} className="font-semibold text-ink/65 hover:text-ink underline-offset-2 hover:underline">Skip setup, just create an account</button>
        )}
      </footer>
    </main>
  );
}

function Summary({ p, name, billingLive, prices, onChoose, onShown }: { p: Personalization; name: string; billingLive: boolean; prices: { PRO: number; BUSINESS: number }; onChoose: (plan: PlanKey) => void; onShown: () => void }) {
  useEffect(() => {
    onShown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.recommendedPlan]);
  const rec = p.recommendedPlan;
  const channelNames = p.answers.channels.filter((c) => c !== "other").map((c) => labelOf(CHANNELS, c));
  const first = name.trim().split(/\s+/)[0];
  return (
    <div className="space-y-5">
      <div className="rounded-[22px] border border-border bg-white px-5 py-5">
        <p className="text-[15px] text-ink/80 leading-relaxed">
          {p.channelCount >= 2
            ? <>{first ? `${first}, you` : "You"} currently manage customers across <span className="font-extrabold text-ink">{p.channelCount} channels</span>{channelNames.length ? ` — ${channelNames.join(", ")}${p.answers.channels.includes("other") ? " and more" : ""}` : ""}. Daythread brings those conversations together on one thread.</>
            : <>{first ? `${first}, your` : "Your"} customers reach you on {channelNames[0] ?? "one channel"}. Daythread keeps that in one inbox, with the calendar, bookings and follow-ups beside it.</>}
        </p>
        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65">Your priorities</p>
        <ul className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {p.priorities.map((f, i) => (
            <li key={f} className={cn("rounded-2xl border px-4 py-3", i === 0 ? "border-accent/40 bg-accent-soft/40" : "border-border bg-paper")}>
              <div className="text-sm font-extrabold text-ink">{PRIORITY_COPY[f].title}</div>
              <div className="mt-0.5 text-xs text-ink/70 leading-relaxed">{PRIORITY_COPY[f].blurb}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-[22px] border border-ink/15 bg-white px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">Our recommendation</p>
        <h2 className="mt-2 font-sans font-extrabold text-[1.5rem] md:text-[1.8rem] leading-[1.05] tracking-[-0.035em] text-ink text-balance">Based on what you told us, we&rsquo;d recommend Daythread {planName(rec)}.</h2>
        <ul className="mt-4 space-y-2">
          {p.reasons.map((r) => (
            <li key={r} className="flex items-start gap-2.5 text-sm text-ink/80 leading-snug">
              <span aria-hidden className="mt-0.5 w-5 h-5 rounded-full bg-success text-white flex items-center justify-center shrink-0"><Check className="w-3 h-3" strokeWidth={3} /></span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink/70">
          {rec === "FREE" ? "Free is $0, no card, and stays free. Pro is there when you need it." : rec === "PRO" ? `Pro is ${fmt(prices.PRO)} a month${billingLive ? ", and starts with 7 days free" : ""}. Free is always there too.` : `Business is ${fmt(prices.BUSINESS)} a month. Free and Pro are always there too.`}
        </p>

        <div className="mt-5 flex flex-col sm:flex-row sm:flex-wrap gap-2.5">
          {rec !== "FREE" && billingLive ? (
            <>
              <Button size="lg" onClick={() => onChoose(rec)}>Continue, and start with {planName(rec)} <ArrowRight className="w-4 h-4 ml-1" strokeWidth={2.5} aria-hidden /></Button>
              <Button size="lg" variant="outline" onClick={() => onChoose("FREE")}>Continue with Free</Button>
            </>
          ) : (
            <Button size="lg" onClick={() => onChoose("FREE")}>Continue with Free <ArrowRight className="w-4 h-4 ml-1" strokeWidth={2.5} aria-hidden /></Button>
          )}
        </div>
        <p className="mt-3 text-xs text-ink/65 leading-relaxed">
          {rec !== "FREE" && !billingLive
            ? `Upgrades aren't open on this deployment yet, so everyone starts on Free. We'll keep this recommendation under Settings → Subscription.`
            : rec === "PRO" && billingLive
              ? "Nothing is charged today. Pro begins as a 7-day free trial once your account exists — a card is asked for then, and cancelling before day 8 costs nothing."
              : rec === "BUSINESS" && billingLive
                ? "Nothing is charged today. Business can be started right after your account exists, from Settings → Subscription."
                : "You can change plans at any time. Daythread only ever bills its own subscription — never your customers."}
        </p>
      </div>
    </div>
  );
}

function Account({ google, draft, answersJson, anonymousId, googleError, referral }: { google: boolean; draft: Draft; answersJson: string | null; anonymousId: string | null; googleError: string | null; referral: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [pending, startTransition] = useTransition();
  const googleMessage = googleError ? ((GOOGLE_SIGN_IN_MESSAGES as Record<string, string>)[googleError] ?? GOOGLE_SIGN_IN_MESSAGES.provider) : null;
  const selectedPlan = draft.selectedPlan ?? undefined;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDuplicateEmail(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signup(formData);
      if (result?.error) {
        setError(result.error);
        setDuplicateEmail(!!result.duplicateEmail);
      }
    });
  }

  return (
    <div className="max-w-sm">
      <p className="-mt-2 mb-6 text-[15px] text-ink/70 leading-relaxed">{answersJson ? "Your answers are ready. Your workspace is built from them the moment your account exists." : "A name, an email and a password. You can tell us how you work later, under Settings."}</p>
      {googleMessage && <FormError>{googleMessage}</FormError>}
      {google && <GoogleButton intent="signup" className={cn("mb-5", googleMessage && "mt-4")} personalization={answersJson || referral ? { answers: answersJson ?? undefined, selectedPlan, anonymousId: anonymousId ?? undefined, ref: referral ?? undefined } : undefined} />}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {answersJson && <input type="hidden" name="answers" value={answersJson} />}
        {selectedPlan && <input type="hidden" name="selectedPlan" value={selectedPlan} />}
        {anonymousId && <input type="hidden" name="anonymousId" value={anonymousId} />}
        {referral && <input type="hidden" name="ref" value={referral} />}
        <Field id="name" label="Your name">
          <Input id="name" name="name" autoComplete="name" placeholder="Alex Rivera" required maxLength={80} defaultValue={draft.displayName ?? ""} />
        </Field>
        <Field id="email" label="Email" error={duplicateEmail ? error : null}>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required aria-invalid={duplicateEmail} />
        </Field>
        {duplicateEmail && (
          <p className="-mt-2 text-xs text-ink/65 flex gap-3">
            <Link href="/login" className="font-semibold text-ink hover:text-accent-text">Log in instead</Link>
            <Link href="/forgot-password" className="font-semibold text-ink hover:text-accent-text">Forgot the password?</Link>
          </p>
        )}
        <Field id="password" label="Password" hint="At least 8 characters.">
          <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} />
        </Field>
        {error && !duplicateEmail && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" className="w-full mt-2" loading={pending} loadingLabel="Creating your Daythread">
          Create my Daythread
        </Button>
        <p className="text-xs text-ink/65 text-center">By continuing you agree to the <Link href="/terms" className="underline">terms</Link> and <Link href="/privacy" className="underline">privacy policy</Link>.</p>
      </form>
    </div>
  );
}
