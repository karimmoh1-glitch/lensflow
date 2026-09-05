"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { X, Check } from "lucide-react";
import { Button, Input, Label, Textarea, Select, Field } from "@/components/ui";
import { completeOnboarding, type OnboardingPayload } from "@/app/actions/onboarding";
import { LogoMark } from "@/components/Logo";
import { ChannelIcon, CHANNEL, type ChannelKey } from "@/app/landing/ChannelIcon";
import { cn } from "@/lib/utils";

/**
 * "Build your Daythread" — six steps instead of eight, each one adding something visible
 * to the thing you're building. The left side is that thing: your booking page and your
 * inbox, filling in as you answer. Connecting a channel is a product moment, not a
 * checkbox: a first message from that channel enters the inbox, Daythread reads it, and
 * the next action appears.
 *
 * The payload sent to completeOnboarding() is unchanged; the same fields are just
 * collected in fewer screens.
 */
const SPECIALTIES = ["Consulting", "Coaching", "Design", "Photography", "Writing", "Web Development", "Event Planning", "Tutoring"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CHANNELS: { key: string; icon: ChannelKey; sample: { who: string; msg: string; knows: string; next: string } }[] = [
  { key: "INSTAGRAM", icon: "instagram", sample: { who: "Maya Chen", msg: "Are you free Tuesday?", knows: "New lead · Tuesday PM", next: "Offer a time" } },
  { key: "EMAIL", icon: "gmail", sample: { who: "Jordan Lee", msg: "Pricing for September?", knows: "New lead · September", next: "Send pricing" } },
  { key: "SMS", icon: "sms", sample: { who: "(512) 555-0148", msg: "Anything open next week?", knows: "New lead · next week", next: "Send booking link" } },
  { key: "WHATSAPP", icon: "whatsapp", sample: { who: "Sam Okafor", msg: "Can we do Thursday 4pm?", knows: "New lead · Thu 4:00 PM", next: "Confirm" } },
];

const DEFAULT_SERVICES: Record<string, { name: string; priceCents: number; durationMins: number }> = {
  Consulting: { name: "Consulting Session", priceCents: 25000, durationMins: 60 },
  Coaching: { name: "Coaching Session", priceCents: 15000, durationMins: 60 },
  Design: { name: "Design Project", priceCents: 80000, durationMins: 480 },
  Photography: { name: "Photo Session", priceCents: 25000, durationMins: 60 },
  Writing: { name: "Writing Project", priceCents: 35000, durationMins: 120 },
  "Web Development": { name: "Web Project", priceCents: 150000, durationMins: 480 },
  "Event Planning": { name: "Event Coverage", priceCents: 60000, durationMins: 180 },
  Tutoring: { name: "Tutoring Session", priceCents: 8000, durationMins: 60 },
};

const PRIORITIES = [
  { key: "messages", label: "Messages", hint: "Know what needs a reply, and what doesn't.", dot: "bg-signal", dotOn: "bg-signal" },
  { key: "clients", label: "Clients", hint: "Where every relationship stands.", dot: "bg-accent", dotOn: "bg-accent" },
  { key: "bookings", label: "Bookings", hint: "The calendar, confirmed and reminded.", dot: "bg-success", dotOn: "bg-spark" },
  { key: "payments", label: "Payments", hint: "Deposits and balances, chased for you.", dot: "bg-warning", dotOn: "bg-warning" },
  { key: "follow-ups", label: "Follow-ups", hint: "Nobody goes quiet without a nudge.", dot: "bg-ink/40", dotOn: "bg-white/70" },
];

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}

const STEPS = [
  { key: "business", label: "Business" },
  { key: "offer", label: "What you do" },
  { key: "focus", label: "What matters" },
  { key: "services", label: "Services" },
  { key: "hours", label: "Hours & deposits" },
  { key: "channels", label: "Channels" },
  { key: "finish", label: "Finish" },
];

export function Wizard({ businessName }: { businessName: string }) {
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(businessName);
  const [handle, setHandle] = useState(slugify(businessName));
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [services, setServices] = useState<{ name: string; priceCents: number; durationMins: number }[]>([{ name: "Consulting Session", priceCents: 25000, durationMins: 60 }]);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startMin, setStartMin] = useState(9 * 60);
  const [endMin, setEndMin] = useState(17 * 60);
  const [depositPercent, setDepositPercent] = useState(30);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(["card", "zelle"]);
  const [connectedChannels, setConnectedChannels] = useState<string[]>([]);
  const [lastConnected, setLastConnected] = useState<string | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [bio, setBio] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");

  const toggleSpecialty = (s: string) => {
    setSpecialties((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
    const def = DEFAULT_SERVICES[s];
    if (def && !specialties.includes(s)) setServices((prev) => (prev.some((p) => p.name === def.name) ? prev : [...prev, { ...def }]));
  };

  const toggleChannel = (key: string) => {
    setConnectedChannels((prev) => {
      const on = prev.includes(key);
      if (!on) setLastConnected(key);
      return on ? prev.filter((x) => x !== key) : [...prev, key];
    });
  };

  const canProceed = useMemo(() => {
    switch (step) {
      case 0:
        return name.trim().length > 0 && handle.trim().length > 0;
      case 1:
        return specialties.length > 0;
      case 2:
        return priorities.length > 0;
      case 3:
        return services.length > 0 && services.every((s) => s.name && s.priceCents > 0);
      case 4:
        return workingDays.length > 0 && endMin > startMin;
      default:
        return true;
    }
  }, [step, name, handle, specialties, priorities, services, workingDays, startMin, endMin]);

  function submit() {
    const payload: OnboardingPayload = {
      businessName: name,
      handle,
      specialties,
      priorities,
      businessType: specialties[0] ?? null,
      services,
      workingDays,
      startMin,
      endMin,
      depositPercent,
      paymentMethods,
      connectedChannels: calendarConnected ? [...connectedChannels, "CALENDAR"] : connectedChannels,
      bio,
      timezone,
    };
    startTransition(() => {
      completeOnboarding(payload);
    });
  }

  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const fmtTime = (m: number) => {
    const h = Math.floor(m / 60);
    return `${((h + 11) % 12) + 1}${m % 60 ? ":" + String(m % 60).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`;
  };
  const last = CHANNELS.find((c) => c.key === lastConnected);

  return (
    <main className="min-h-screen bg-paper lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      {/* What you're building */}
      <section aria-hidden className="relative bg-midnight text-paper overflow-hidden lg:min-h-screen">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_25%_25%,rgba(109,90,230,0.22),transparent_70%),radial-gradient(50%_40%_at_85%_85%,rgba(240,82,77,0.14),transparent_70%)]" />
        <div className="relative flex flex-col h-full px-6 py-6 lg:px-12 lg:py-10 gap-6">
          <Link href="/" className="inline-flex items-center gap-2.5 text-paper w-fit">
            <LogoMark className="w-6 h-6" />
            <span className="font-sans font-extrabold text-lg tracking-tight">Daythread</span>
          </Link>
          <div className="lg:my-auto space-y-4 max-w-md">
            {/* Booking page preview */}
            <div className="rounded-2xl border border-paper/10 bg-paper/[0.04] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-paper/40 mb-2">Your booking page</div>
              <div className="text-sm font-mono text-paper/50 truncate">daythread.org/book/<span className="text-paper">{handle || "your-name"}</span></div>
              <div className="mt-3 text-lg font-extrabold tracking-tight text-paper truncate">{name || "Your business"}</div>
              {specialties.length > 0 && <div className="mt-1 text-xs text-paper/55">{specialties.join(" · ")}</div>}
              <div className="mt-3 space-y-1.5">
                {services.slice(0, 3).map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-paper/80 truncate">{s.name || "Service"}</span>
                    <span className="text-paper/60 tabular-nums shrink-0">${(s.priceCents / 100).toLocaleString()} · {s.durationMins}m</span>
                  </div>
                ))}
              </div>
              {step >= 3 && (
                <div className="mt-3 pt-3 border-t border-paper/10 text-xs text-paper/55 dt-swap">
                  {workingDays.map((d) => DAYS[d]).join(", ")} · {fmtTime(startMin)}–{fmtTime(endMin)} · {depositPercent}% deposit
                </div>
              )}
            </div>

            {/* Inbox preview — the product moment lives here */}
            <div className="rounded-2xl border border-paper/10 bg-paper/[0.04] p-4 min-h-[150px]">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-paper/40">Your inbox</div>
                <div className="flex -space-x-1.5">
                  {connectedChannels.map((k) => {
                    const c = CHANNELS.find((x) => x.key === k)!;
                    return <ChannelIcon key={k} k={c.icon} size={20} className="ring-2 ring-midnight" />;
                  })}
                </div>
              </div>
              {!last ? (
                <p className="text-xs text-paper/40 leading-relaxed">{step < 4 ? "Connect a channel and the first message shows up here." : "Turn on a channel to see a message arrive."}</p>
              ) : (
                <ol key={last.key} className="relative pl-6 dt-swap">
                  <span aria-hidden className="absolute left-[5px] top-2 bottom-2 w-px bg-paper/15" />
                  <li className="relative py-1.5">
                    <span aria-hidden className="absolute -left-6 top-[9px] w-[11px] h-[11px] rounded-full border-2 border-midnight bg-accent" />
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">{CHANNEL[last.icon].name}</div>
                    <div className="text-sm text-paper"><span className="font-semibold">{last.sample.who}</span> <span className="text-paper/60">“{last.sample.msg}”</span></div>
                  </li>
                  <li className="relative py-1.5" style={{ animationDelay: "500ms" }}>
                    <span aria-hidden className="absolute -left-6 top-[9px] w-[11px] h-[11px] rounded-full border-2 border-midnight bg-signal" />
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-signal">Daythread knows</div>
                    <div className="text-sm text-paper/80">{last.sample.knows}</div>
                  </li>
                  <li className="relative py-1.5">
                    <span aria-hidden className="absolute -left-6 top-[9px] w-[11px] h-[11px] rounded-full border-2 border-midnight bg-success" />
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-success">Next</div>
                    <div className="text-sm font-semibold text-paper">{last.sample.next}</div>
                  </li>
                </ol>
              )}
            </div>
          </div>
          <p className="hidden lg:block text-sm text-paper/45 max-w-sm">You&rsquo;re building the place your whole business will live. Two minutes.</p>
        </div>
      </section>

      {/* Steps */}
      <section className="px-6 py-8 lg:py-14 flex items-start justify-center">
        <div className="w-full max-w-md">
          {/* Progress: the thread, one node per step */}
          <ol className="flex items-center mb-8" aria-label="Setup progress">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex items-center flex-1 last:flex-none">
                <span
                  aria-current={i === step ? "step" : undefined}
                  className={cn("w-[11px] h-[11px] rounded-full shrink-0 transition-colors duration-300", i < step ? "bg-success" : i === step ? "bg-accent ring-4 ring-accent/20" : "bg-ink/15")}
                  title={s.label}
                />
                {i < STEPS.length - 1 && <span className={cn("h-px flex-1 mx-1.5 transition-colors duration-500", i < step ? "bg-success" : "bg-ink/10")} />}
              </li>
            ))}
          </ol>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/45 mb-3">
            {step + 1} of {STEPS.length} · {STEPS[step].label}
          </p>

          <div key={step} className="dt-swap">
            {step === 0 && (
              <div className="space-y-5">
                <h1 className="font-sans font-extrabold text-[2rem] leading-[1.05] tracking-[-0.035em] text-ink">What&rsquo;s it called?</h1>
                <Field id="bname" label="Business name">
                  <Input
                    id="bname"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setHandle(slugify(e.target.value));
                    }}
                    placeholder="Alex Rivera Consulting"
                    autoFocus
                  />
                </Field>
                <Field id="handle" label="Booking page address" hint="Clients book you here. You can change it later.">
                  <div className="flex items-center rounded-lg border border-ink/[0.14] bg-white overflow-hidden transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20">
                    <span className="bg-black/[0.04] px-3 h-10 flex items-center text-sm text-ink/50 shrink-0">daythread.org/book/</span>
                    <input id="handle" value={handle} onChange={(e) => setHandle(slugify(e.target.value))} className="flex-1 min-w-0 px-2.5 h-10 text-sm outline-none bg-transparent" />
                  </div>
                </Field>
                <Field id="tz" label="Timezone">
                  <Select id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    <option value="America/New_York">Eastern (US)</option>
                    <option value="America/Chicago">Central (US)</option>
                    <option value="America/Denver">Mountain (US)</option>
                    <option value="America/Los_Angeles">Pacific (US)</option>
                  </Select>
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <h1 className="font-sans font-extrabold text-[2rem] leading-[1.05] tracking-[-0.035em] text-ink">What do you do?</h1>
                <p className="text-sm text-ink/60">Pick everything that applies. Each one adds a starter service.</p>
                <div className="flex flex-wrap gap-2">
                  {SPECIALTIES.map((s) => {
                    const on = specialties.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSpecialty(s)}
                        aria-pressed={on}
                        className={cn(
                          "px-4 h-10 rounded-full text-sm font-semibold border transition-all duration-150 ease-[cubic-bezier(0.22,1.2,0.36,1)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                          on ? "bg-ink text-white border-ink" : "bg-white border-ink/[0.14] hover:border-ink/30 hover:-translate-y-px"
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <h1 className="font-sans font-extrabold text-[2rem] leading-[1.05] tracking-[-0.035em] text-ink">What matters most?</h1>
                <p className="text-sm text-ink/60">Daythread arranges itself around this — what it shows first, what it chases for you.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PRIORITIES.map((p) => {
                    const on = priorities.includes(p.key);
                    return (
                      <button
                        key={p.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPriorities((prev) => (on ? prev.filter((x) => x !== p.key) : [...prev, p.key]))}
                        className={cn(
                          "text-left rounded-2xl border px-4 py-3.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                          on ? "border-ink bg-ink text-white shadow-[0_10px_30px_-18px_rgba(16,17,20,0.6)]" : "border-border bg-white hover:border-ink/25"
                        )}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className={cn("w-2 h-2 rounded-full shrink-0", on ? p.dotOn : p.dot)} />
                          <span className="text-sm font-semibold">{p.label}</span>
                        </span>
                        <span className={cn("block text-xs mt-1 pl-[18px]", on ? "text-white/65" : "text-ink/55")}>{p.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <h1 className="font-sans font-extrabold text-[2rem] leading-[1.05] tracking-[-0.035em] text-ink">Your services.</h1>
                <p className="text-sm text-ink/60">Prices power your booking page, invoices and AI replies.</p>
                <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin pr-1">
                  {services.map((svc, i) => (
                    <div key={i} className="flex gap-2 items-end">
                      <div className="flex-1 min-w-0">
                        <Label>Service</Label>
                        <Input value={svc.name} onChange={(e) => setServices((prev) => prev.map((p, idx) => (idx === i ? { ...p, name: e.target.value } : p)))} />
                      </div>
                      <div className="w-24">
                        <Label>Price $</Label>
                        <Input type="number" inputMode="decimal" value={svc.priceCents / 100} onChange={(e) => setServices((prev) => prev.map((p, idx) => (idx === i ? { ...p, priceCents: Math.round(Number(e.target.value) * 100) } : p)))} />
                      </div>
                      <div className="w-20">
                        <Label>Mins</Label>
                        <Input type="number" inputMode="numeric" value={svc.durationMins} onChange={(e) => setServices((prev) => prev.map((p, idx) => (idx === i ? { ...p, durationMins: Number(e.target.value) } : p)))} />
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setServices((prev) => prev.filter((_, idx) => idx !== i))} aria-label="Remove service" className="h-10">
                        <X className="w-4 h-4" strokeWidth={2} />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => setServices((prev) => [...prev, { name: "New service", priceCents: 20000, durationMins: 60 }])}>
                  + Add a service
                </Button>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <h1 className="font-sans font-extrabold text-[2rem] leading-[1.05] tracking-[-0.035em] text-ink">When do you work?</h1>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d, i) => {
                    const on = workingDays.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setWorkingDays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))}
                        className={cn(
                          "w-11 h-11 rounded-full text-sm font-semibold border transition-all duration-150 ease-[cubic-bezier(0.22,1.2,0.36,1)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                          on ? "bg-ink text-white border-ink" : "bg-white border-ink/[0.14] hover:border-ink/30"
                        )}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field id="start" label="From">
                    <Input id="start" type="time" value={hhmm(startMin)} onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setStartMin(h * 60 + m); }} />
                  </Field>
                  <Field id="end" label="Until">
                    <Input id="end" type="time" value={hhmm(endMin)} onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setEndMin(h * 60 + m); }} />
                  </Field>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="deposit" className="text-[13px] font-semibold text-ink/80">Deposit to hold a date</label>
                    <span className="text-sm font-extrabold text-ink tabular-nums">{depositPercent}%</span>
                  </div>
                  <input id="deposit" type="range" min={0} max={100} step={5} value={depositPercent} onChange={(e) => setDepositPercent(Number(e.target.value))} className="w-full accent-[#F0524D]" />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-ink/80 mb-1.5">How you get paid</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: "card", label: "Card" },
                      { key: "zelle", label: "Zelle" },
                      { key: "bank_transfer", label: "Bank" },
                    ].map((m) => {
                      const on = paymentMethods.includes(m.key);
                      return (
                        <button
                          key={m.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setPaymentMethods((prev) => (prev.includes(m.key) ? prev.filter((x) => x !== m.key) : [...prev, m.key]))}
                          className={cn(
                            "h-10 rounded-lg text-sm font-semibold border transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                            on ? "bg-ink text-white border-ink" : "bg-white border-ink/[0.14] hover:border-ink/30"
                          )}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-5">
                <h1 className="font-sans font-extrabold text-[2rem] leading-[1.05] tracking-[-0.035em] text-ink">Where do clients reach you?</h1>
                <p className="text-sm text-ink/60">Turn on what you use and watch the inbox on the left read a sample message. Nothing connects here — each one connects with the provider&rsquo;s own sign-in from Settings once you&rsquo;re in.</p>
                <div className="grid grid-cols-2 gap-3">
                  {CHANNELS.map((c) => {
                    const on = connectedChannels.includes(c.key);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => toggleChannel(c.key)}
                        aria-pressed={on}
                        className={cn(
                          "relative flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 ease-[cubic-bezier(0.22,1.2,0.36,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                          on ? "border-ink/20 bg-white shadow-popover -translate-y-0.5" : "border-ink/[0.14] bg-white hover:border-ink/30 hover:-translate-y-px"
                        )}
                      >
                        <ChannelIcon k={c.icon} size={40} active={on} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-ink">{CHANNEL[c.icon].name}</span>
                          <span className="block text-[11px] text-ink/50">{on ? "I use this — connect it after setup" : "Do you use this?"}</span>
                        </span>
                        <span className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-200", on ? "bg-success text-white scale-100" : "bg-black/[0.06] scale-90")}>
                          {on && <Check className="w-3 h-3" strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarConnected((c) => !c)}
                  aria-pressed={calendarConnected}
                  className={cn("w-full flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50", calendarConnected ? "border-ink/20 bg-white shadow-popover" : "border-ink/[0.14] hover:border-ink/30")}
                >
                  <span>
                    <span className="block text-sm font-semibold text-ink">Google / Apple Calendar</span>
                    <span className="block text-[11px] text-ink/50">Sync isn&rsquo;t built yet — this keeps the setting ready for when it is.</span>
                  </span>
                  <span className={cn("text-[11px] font-bold rounded-full px-2 py-0.5", calendarConnected ? "bg-warning-soft text-warning-text" : "bg-black/[0.05] text-ink/55")}>{calendarConnected ? "Yes" : "No"}</span>
                </button>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-5">
                <h1 className="font-sans font-extrabold text-[2rem] leading-[1.05] tracking-[-0.035em] text-ink">One line about you.</h1>
                <p className="text-sm text-ink/60">It goes at the top of your booking page. Optional.</p>
                <Field id="bio" label="Short bio">
                  <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="I help small teams design the thing they've been putting off. Based in Austin." />
                </Field>
                <div className="rounded-2xl border border-border bg-white px-4 py-3.5 text-sm text-ink/70 leading-relaxed">
                  <span className="font-semibold text-ink">{name}</span> · {services.length} service{services.length === 1 ? "" : "s"} · {connectedChannels.length} channel{connectedChannels.length === 1 ? "" : "s"} · {depositPercent}% deposit
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-8">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button size="lg" onClick={() => setStep((s) => s + 1)} disabled={!canProceed}>
                Continue
              </Button>
            ) : (
              <Button size="lg" onClick={submit} loading={pending} loadingLabel="Building your Daythread">
                Open my Daythread
              </Button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
