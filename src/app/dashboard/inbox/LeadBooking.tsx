"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, format, isSameDay } from "date-fns";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { checkLeadAvailability, bookLead } from "@/app/actions/leads";

type Slot = { start: string; end: string };
type ServiceOption = { id: string; name: string; durationMins: number; priceCents: number };

const NEXT_DAYS = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i + 1));

/**
 * Conversation → booking, without leaving the thread: pick the service (pre-filled when the
 * inquiry named one), a day, then an open time, then review it and book. A booking puts a
 * real appointment on the calendar, so choosing a time never creates one on its own — the
 * last step always says exactly what will be booked.
 */
export function LeadBooking({ leadId, serviceId, services, timezone }: { leadId: string; serviceId: string | null; services: ServiceOption[]; timezone: string }) {
  // Times are the business's wall clock, not the browser's — the owner may be travelling.
  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" });
  const [open, setOpen] = useState(false);
  const [service, setService] = useState<string | null>(serviceId ?? (services.length === 1 ? services[0].id : null));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [chosenSlot, setChosenSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function pickDay(day: Date, svc = service) {
    if (!svc) return;
    setSelectedDay(day);
    setSlots(null);
    setChosenSlot(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await checkLeadAvailability(leadId, format(day, "yyyy-MM-dd"), svc);
        setSlots(result.slots);
      } catch {
        setError("Couldn't load availability. Try again.");
      }
    });
  }

  function pickService(id: string) {
    setService(id);
    setSlots(null);
    setChosenSlot(null);
    if (selectedDay) pickDay(selectedDay, id);
  }

  function book(slot: Slot) {
    setError(null);
    startTransition(async () => {
      try {
        const { bookingId } = await bookLead(leadId, slot.start, service);
        router.push(`/dashboard/bookings/${bookingId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create the booking.");
      }
    });
  }

  if (services.length === 0) {
    return (
      <p className="text-xs text-ink/70">
        Add a service under <Link href="/dashboard/settings?tab=business" className="font-semibold text-ink underline decoration-ink/20 underline-offset-2">Settings → Business</Link> to book from here.
      </p>
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        See open times
      </Button>
    );
  }

  const chosen = services.find((s) => s.id === service) ?? null;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`svc-${leadId}`} className="block text-13 font-semibold text-ink/65 mb-1.5">
          Service
        </label>
        <select
          id={`svc-${leadId}`}
          value={service ?? ""}
          onChange={(e) => pickService(e.target.value)}
          className="w-full h-9 rounded-lg border border-ink/[0.14] bg-white px-2.5 text-13 text-ink focus:outline-none focus:border-ink/40 focus:ring-[3px] focus:ring-ink/[0.06]"
        >
          {!service && <option value="">Pick a service…</option>}
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.durationMins} min · ${(s.priceCents / 100).toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      <div className="text-13 font-semibold text-ink/65">Pick a day</div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1">
        {NEXT_DAYS.map((day) => {
          const active = selectedDay && isSameDay(day, selectedDay);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => pickDay(day)}
              disabled={!service}
              aria-pressed={Boolean(active)}
              className={cn(
                "shrink-0 w-11 flex flex-col items-center py-2 rounded-lg border transition-colors disabled:opacity-40",
                active ? "bg-ink text-white border-ink" : "bg-white text-ink border-border hover:border-ink/30"
              )}
            >
              <span className={cn("text-2xs font-medium", active ? "text-white/60" : "text-ink/65")}>{format(day, "EEE")}</span>
              <span className="text-sm font-semibold mt-0.5">{format(day, "d")}</span>
            </button>
          );
        })}
      </div>
      {!service && <p className="text-xs text-ink/65">Pick a service to see open times.</p>}

      {error && <p className="text-xs text-danger" role="alert">{error}</p>}

      {pending && !slots ? (
        <p className="text-xs text-ink/65">Loading times…</p>
      ) : slots ? (
        slots.length === 0 ? (
          <p className="text-xs text-ink/65">No open times this day{chosen ? ` for a ${chosen.durationMins}-minute ${chosen.name.toLowerCase()}` : ""}.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Open times">
            {slots.map((slot) => {
              const on = chosenSlot?.start === slot.start;
              return (
                <button
                  key={slot.start}
                  type="button"
                  disabled={pending}
                  aria-pressed={on}
                  onClick={() => setChosenSlot(on ? null : slot)}
                  className={cn("text-xs font-medium h-8 px-2.5 rounded-md border transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70", on ? "bg-ink text-white border-ink" : "bg-white text-ink border-ink/[0.12] hover:border-ink/30")}
                >
                  {timeFmt.format(new Date(slot.start))}
                </button>
              );
            })}
          </div>
        )
      ) : null}

      {chosenSlot && chosen && (
        <div className="rounded-lg border border-border bg-paper/60 p-3 dt-swap" aria-live="polite">
          <p className="text-13 text-ink leading-snug">
            <span className="font-semibold">{chosen.name}</span> · {new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric" }).format(new Date(chosenSlot.start))} at {timeFmt.format(new Date(chosenSlot.start))}
          </p>
          <p className="mt-0.5 text-xs text-ink/60">{chosen.durationMins} min · ${(chosen.priceCents / 100).toLocaleString()} · added to your calendar</p>
          <div className="mt-2.5 flex items-center gap-2">
            <Button size="sm" onClick={() => book(chosenSlot)} loading={pending} loadingLabel="Booking">Book it</Button>
            <Button size="sm" variant="ghost" onClick={() => setChosenSlot(null)} disabled={pending}>Change</Button>
          </div>
        </div>
      )}
    </div>
  );
}
