"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, CheckCircle2 } from "lucide-react";
import { Card, CardBody, Button, Input, Label, Textarea } from "@/components/ui";
import { getSlotsForDate, createPublicBooking } from "@/app/actions/publicBooking";
import { cn, formatMoney } from "@/lib/utils";
import { format } from "date-fns";

type Service = { id: string; name: string; priceCents: number; durationMins: number };
type Slot = { start: string; end: string };

export function BookingFlow({ handle, services, depositPercent }: { handle: string; services: Service[]; depositPercent: number }) {
  const [step, setStep] = useState(0);
  const [service, setService] = useState<Service | null>(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const [result, setResult] = useState<Awaited<ReturnType<typeof createPublicBooking>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!service || !date) return;
    setSlots(null);
    setSlot(null);
    startTransition(async () => {
      const s = await getSlotsForDate(handle, `${date}T00:00:00`, service.id);
      setSlots(s);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, date]);

  function submit() {
    if (!service || !slot) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await createPublicBooking({
          handle,
          serviceId: service.id,
          startISO: slot.start,
          name,
          email,
          phone,
          location,
          notes,
        });
        setResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  if (result) {
    return (
      <Card>
        <CardBody className="text-center py-10">
          <CheckCircle2 className="w-9 h-9 text-success mx-auto mb-3" strokeWidth={1.75} />
          <h2 className="font-display text-2xl mb-2">You're booked!</h2>
          <p className="text-sm text-ink/55 mb-6">
            {service?.name} on {slot && format(new Date(slot.start), "EEEE, MMMM d 'at' h:mm a")}
          </p>

          {result.depositCents > 0 && (
            <div className="rounded-xl border border-border p-5 text-left max-w-sm mx-auto">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/40 mb-2">Deposit due</div>
              <div className="font-display text-2xl mb-3">{formatMoney(result.depositCents)}</div>
              {result.paymentMethod === "card" && result.checkoutUrl && (
                <a href={result.checkoutUrl}>
                  <Button className="w-full">Pay deposit now</Button>
                </a>
              )}
              {result.paymentMethod === "zelle" && (
                <div className="text-sm space-y-1.5">
                  <p>Send to: <span className="font-medium">{result.zelleHandle}</span></p>
                  <p>Reference: <span className="font-medium">{result.reference}</span></p>
                  <p className="text-xs text-ink/45">Once sent, we'll confirm your booking shortly.</p>
                </div>
              )}
              {result.paymentMethod === "bank_transfer" && (
                <div className="text-sm space-y-1.5">
                  <p className="whitespace-pre-wrap">{result.bankInstructions}</p>
                  <p>Reference: <span className="font-medium">{result.reference}</span></p>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-black/[0.08]")} />
        ))}
      </div>
      <Card>
        <CardBody className="p-6">
        {step === 0 && (
          <div className="space-y-3">
            <h2 className="font-display text-xl mb-3">Choose a service</h2>
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setService(s);
                  setStep(1);
                }}
                className="w-full flex items-center justify-between rounded-lg border border-border px-4 py-3 text-left hover:border-ink/20"
              >
                <div>
                  <div className="font-medium text-sm">{s.name}</div>
                  <div className="text-xs text-ink/45">{s.durationMins} min</div>
                </div>
                <div className="font-medium text-sm">{formatMoney(s.priceCents)}</div>
              </button>
            ))}
          </div>
        )}

        {step === 1 && service && (
          <div className="space-y-4">
            <button onClick={() => setStep(0)} className="flex items-center gap-1 text-xs text-ink/40 hover:text-ink mb-1">
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} />
              {service.name}
            </button>
            <h2 className="font-display text-xl">Pick a date & time</h2>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} min={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setDate(e.target.value)} />
            </div>
            {date && (
              <div>
                <Label>Available times</Label>
                {pending && !slots && <p className="text-sm text-ink/40">Checking availability…</p>}
                {slots && slots.length === 0 && <p className="text-sm text-ink/40">No openings this day — try another date.</p>}
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {slots?.map((s) => (
                    <button
                      key={s.start}
                      onClick={() => setSlot(s)}
                      className={cn(
                        "text-sm rounded-lg border px-2 py-2",
                        slot?.start === s.start ? "bg-ink text-white border-ink" : "border-border hover:border-ink/20"
                      )}
                    >
                      {format(new Date(s.start), "h:mm a")}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Button className="w-full" disabled={!slot} onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        )}

        {step === 2 && service && slot && (
          <div className="space-y-4">
            <button onClick={() => setStep(1)} className="flex items-center gap-1 text-xs text-ink/40 hover:text-ink mb-1">
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} />
              {format(new Date(slot.start), "MMM d, h:mm a")}
            </button>
            <h2 className="font-display text-xl">Your details</h2>
            <div>
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>Location (optional)</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Studio, park, your home…" />
            </div>
            <div>
              <Label>Anything we should know?</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>

            <div className="rounded-lg bg-black/[0.03] p-3 text-sm flex justify-between">
              <span className="text-ink/55">Total</span>
              <span className="font-medium">{formatMoney(service.priceCents)}</span>
            </div>
            {depositPercent > 0 && (
              <div className="rounded-lg bg-accent-soft/50 p-3 text-sm flex justify-between">
                <span className="text-ink/55">Deposit to hold your date ({depositPercent}%)</span>
                <span className="font-medium">{formatMoney(Math.round((service.priceCents * depositPercent) / 100))}</span>
              </div>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button className="w-full" disabled={!name || !email || pending} onClick={submit}>
              {pending ? "Booking…" : "Confirm booking"}
            </Button>
          </div>
        )}
        </CardBody>
      </Card>
    </div>
  );
}
