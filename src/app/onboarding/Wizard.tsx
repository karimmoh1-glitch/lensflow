"use client";

import { useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button, Input, Label, Card, CardBody, Badge, Textarea, Select } from "@/components/ui";
import { completeOnboarding, type OnboardingPayload } from "@/app/actions/onboarding";
import { cn } from "@/lib/utils";

const SPECIALTIES = ["Consulting", "Coaching", "Design", "Photography", "Writing", "Web Development", "Event Planning", "Tutoring"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CHANNELS: { key: string; label: string; blurb: string }[] = [
  { key: "INSTAGRAM", label: "Instagram", blurb: "DMs land in your inbox" },
  { key: "EMAIL", label: "Email", blurb: "Inquiries and replies" },
  { key: "SMS", label: "SMS", blurb: "Text reminders and replies" },
  { key: "WHATSAPP", label: "WhatsApp", blurb: "Where supported in your region" },
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

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}

export function Wizard({ businessName }: { businessName: string }) {
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(businessName);
  const [handle, setHandle] = useState(slugify(businessName));
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [services, setServices] = useState<{ name: string; priceCents: number; durationMins: number }[]>([
    { name: "Consulting Session", priceCents: 25000, durationMins: 60 },
  ]);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startMin, setStartMin] = useState(9 * 60);
  const [endMin, setEndMin] = useState(17 * 60);
  const [depositPercent, setDepositPercent] = useState(30);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(["card", "zelle"]);
  const [connectedChannels, setConnectedChannels] = useState<string[]>([]);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [bio, setBio] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");

  const steps = ["Business", "Specialties", "Services", "Availability", "Payments", "Channels", "Calendar", "Profile"];

  const toggleSpecialty = (s: string) => {
    setSpecialties((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
    const def = DEFAULT_SERVICES[s];
    if (def && !specialties.includes(s)) {
      setServices((prev) => (prev.some((p) => p.name === def.name) ? prev : [...prev, { ...def }]));
    }
  };

  const canProceed = useMemo(() => {
    switch (step) {
      case 0:
        return name.trim().length > 0 && handle.trim().length > 0;
      case 1:
        return specialties.length > 0;
      case 2:
        return services.length > 0 && services.every((s) => s.name && s.priceCents > 0);
      case 3:
        return workingDays.length > 0 && endMin > startMin;
      default:
        return true;
    }
  }, [step, name, handle, specialties, services, workingDays, startMin, endMin]);

  function submit() {
    const payload: OnboardingPayload = {
      businessName: name,
      handle,
      specialties,
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

  return (
    <main className="min-h-screen bg-paper flex flex-col items-center px-6 py-10">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-1.5 mb-8">
          {steps.map((s, i) => (
            <div key={s} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-black/10")} />
          ))}
        </div>

        <Card>
          <CardBody className="p-8">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent-text mb-2">
              Step {step + 1} of {steps.length} — {steps[step]}
            </div>

            {step === 0 && (
              <div className="space-y-4">
                <h1 className="font-display text-2xl">What's your business called?</h1>
                <div>
                  <Label htmlFor="bname">Business name</Label>
                  <Input
                    id="bname"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setHandle(slugify(e.target.value));
                    }}
                    placeholder="Alex Rivera Consulting"
                  />
                </div>
                <div>
                  <Label htmlFor="handle">Your booking page URL</Label>
                  <div className="flex items-center rounded-lg border border-border overflow-hidden">
                    <span className="bg-black/5 px-3 py-2 text-sm text-ink/50">lensflow.app/book/</span>
                    <input
                      id="handle"
                      value={handle}
                      onChange={(e) => setHandle(slugify(e.target.value))}
                      className="flex-1 px-2 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <h1 className="font-display text-2xl">What do you offer?</h1>
                <p className="text-sm text-ink/50">Pick everything that applies — you can change this later.</p>
                <div className="flex flex-wrap gap-2">
                  {SPECIALTIES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSpecialty(s)}
                      className={cn(
                        "px-3.5 py-2 rounded-full text-sm font-medium border transition-colors",
                        specialties.includes(s) ? "bg-ink text-white border-ink" : "bg-white border-border hover:border-ink/20"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h1 className="font-display text-2xl">Your services</h1>
                <p className="text-sm text-ink/50">Set your pricing — this powers AI replies, invoices, and your booking page.</p>
                <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin pr-1">
                  {services.map((svc, i) => (
                    <div key={i} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label>Service</Label>
                        <Input
                          value={svc.name}
                          onChange={(e) => setServices((prev) => prev.map((p, idx) => (idx === i ? { ...p, name: e.target.value } : p)))}
                        />
                      </div>
                      <div className="w-24">
                        <Label>Price $</Label>
                        <Input
                          type="number"
                          value={svc.priceCents / 100}
                          onChange={(e) =>
                            setServices((prev) =>
                              prev.map((p, idx) => (idx === i ? { ...p, priceCents: Math.round(Number(e.target.value) * 100) } : p))
                            )
                          }
                        />
                      </div>
                      <div className="w-24">
                        <Label>Mins</Label>
                        <Input
                          type="number"
                          value={svc.durationMins}
                          onChange={(e) =>
                            setServices((prev) => prev.map((p, idx) => (idx === i ? { ...p, durationMins: Number(e.target.value) } : p)))
                          }
                        />
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setServices((prev) => prev.filter((_, idx) => idx !== i))} aria-label="Remove service">
                        <X className="w-4 h-4" strokeWidth={2} />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setServices((prev) => [...prev, { name: "New Service", priceCents: 20000, durationMins: 60 }])}
                >
                  + Add service
                </Button>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <h1 className="font-display text-2xl">When do you work?</h1>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setWorkingDays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))}
                      className={cn(
                        "w-12 h-12 rounded-full text-sm font-medium border transition-colors",
                        workingDays.includes(i) ? "bg-ink text-white border-ink" : "bg-white border-border hover:border-ink/20"
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label>Start time</Label>
                    <Input
                      type="time"
                      value={`${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(":").map(Number);
                        setStartMin(h * 60 + m);
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <Label>End time</Label>
                    <Input
                      type="time"
                      value={`${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(":").map(Number);
                        setEndMin(h * 60 + m);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <h1 className="font-display text-2xl">How do you get paid?</h1>
                <div className="space-y-2">
                  {[
                    { key: "card", label: "Card / Apple Pay" },
                    { key: "zelle", label: "Zelle" },
                    { key: "bank_transfer", label: "Bank transfer" },
                  ].map((m) => (
                    <label key={m.key} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={paymentMethods.includes(m.key)}
                        onChange={() =>
                          setPaymentMethods((prev) => (prev.includes(m.key) ? prev.filter((x) => x !== m.key) : [...prev, m.key]))
                        }
                      />
                      <span className="text-sm font-medium">{m.label}</span>
                    </label>
                  ))}
                </div>
                <div>
                  <Label htmlFor="deposit">Deposit required to hold a date ({depositPercent}%)</Label>
                  <input
                    id="deposit"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={depositPercent}
                    onChange={(e) => setDepositPercent(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3">
                <h1 className="font-display text-2xl">Connect your channels</h1>
                <p className="text-sm text-ink/50">
                  Real OAuth setup happens later in Settings → Connections, where each channel explains exactly what it needs. Turn these
                  on now to see the inbox work end-to-end with simulated messages in the meantime — nothing here claims a real connection.
                </p>
                {CHANNELS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() =>
                      setConnectedChannels((prev) => (prev.includes(c.key) ? prev.filter((x) => x !== c.key) : [...prev, c.key]))
                    }
                    className="w-full flex items-center justify-between rounded-lg border border-border px-4 py-3 text-left hover:border-ink/20"
                  >
                    <div>
                      <div className="font-medium text-sm">{c.label}</div>
                      <div className="text-xs text-ink/45">{c.blurb}</div>
                    </div>
                    <Badge tone={connectedChannels.includes(c.key) ? "warning" : "neutral"}>
                      {connectedChannels.includes(c.key) ? "Demo mode" : "Enable demo"}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            {step === 6 && (
              <div className="space-y-3">
                <h1 className="font-display text-2xl">Connect your calendar</h1>
                <p className="text-sm text-ink/50">
                  Keep bookings in sync with your existing calendar. Real Google/Apple Calendar sync isn't built yet — enabling this just
                  reserves the setting so it's ready when it is.
                </p>
                <button
                  type="button"
                  onClick={() => setCalendarConnected((c) => !c)}
                  className="w-full flex items-center justify-between rounded-lg border border-border px-4 py-3 text-left hover:border-ink/20"
                >
                  <div className="font-medium text-sm">Google / Apple Calendar</div>
                  <Badge tone={calendarConnected ? "warning" : "neutral"}>{calendarConnected ? "Demo mode" : "Enable demo"}</Badge>
                </button>
              </div>
            )}

            {step === 7 && (
              <div className="space-y-4">
                <h1 className="font-display text-2xl">Finish your profile</h1>
                <div>
                  <Label htmlFor="bio">Short bio for your booking page</Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={4}
                    placeholder="I help clients with... based in..."
                  />
                </div>
                <div>
                  <Label htmlFor="tz">Timezone</Label>
                  <Select id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    <option value="America/New_York">Eastern (US)</option>
                    <option value="America/Chicago">Central (US)</option>
                    <option value="America/Denver">Mountain (US)</option>
                    <option value="America/Los_Angeles">Pacific (US)</option>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mt-8">
              <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
                Back
              </Button>
              {step < steps.length - 1 ? (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed}>
                  Continue
                </Button>
              ) : (
                <Button onClick={submit} disabled={pending}>
                  {pending ? "Setting up…" : "Finish setup"}
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
