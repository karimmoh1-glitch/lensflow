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
 * inquiry named one), a day, then an open time. The booking lands on the calendar and the
 * booking page opens for confirmation.
 */
export function LeadBooking({ leadId, serviceId, services, timezone }: { leadId: string; serviceId: string | null; services: ServiceOption[]; timezone: string }) {
  // Times are the business's wall clock, not the browser's — the owner may be travelling.
  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" });
  const [open, setOpen] = useState(false);
  const [service, setService] = useState<string | null>(serviceId ?? (services.length === 1 ? services[0].id : null));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function pickDay(day: Date, svc = service) {
    if (!svc) return;
    setSelectedDay(day);
    setSlots(null);
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
    if (selectedDay) pickDay(selectedDay, id);
  }

  function pickSlot(slot: Slot) {
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
      <p className="text-xs text-ink/65">
        Add a service under <Link href="/dashboard/settings?tab=business" className="font-semibold text-accent-text hover:underline">Settings → Business</Link> to book from here.
      </p>
    );
  }

  if (!open) {
    return (
      <Button size="sm" className="w-full" onClick={() => setOpen(true)}>
        Check Availability
      </Button>
    );
  }

  const chosen = services.find((s) => s.id === service) ?? null;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`svc-${leadId}`} className="block text-xs font-semibold uppercase tracking-wide text-ink/60 mb-1.5">
          Service
        </label>
        <select
          id={`svc-${leadId}`}
          value={service ?? ""}
          onChange={(e) => pickService(e.target.value)}
          className="w-full rounded-lg border border-border bg-white px-2.5 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {!service && <option value="">Pick a service…</option>}
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.durationMins} min · ${(s.priceCents / 100).toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      <div className="text-xs font-semibold uppercase tracking-wide text-ink/60">Pick a day</div>
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
              <span className={cn("text-[10px] font-medium", active ? "text-white/60" : "text-ink/60")}>{format(day, "EEE")}</span>
              <span className="text-sm font-semibold mt-0.5">{format(day, "d")}</span>
            </button>
          );
        })}
      </div>
      {!service && <p className="text-xs text-ink/60">Pick a service to see open times.</p>}

      {error && <p className="text-xs text-danger" role="alert">{error}</p>}

      {pending && !slots ? (
        <p className="text-xs text-ink/60">Loading times…</p>
      ) : slots ? (
        slots.length === 0 ? (
          <p className="text-xs text-ink/60">No open times this day{chosen ? ` for a ${chosen.durationMins}-minute ${chosen.name.toLowerCase()}` : ""}.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {slots.map((slot) => (
              <button
                key={slot.start}
                type="button"
                disabled={pending}
                onClick={() => pickSlot(slot)}
                className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-border bg-white hover:border-accent hover:bg-accent-soft hover:text-accent-text transition-colors disabled:opacity-50"
              >
                {timeFmt.format(new Date(slot.start))}
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
