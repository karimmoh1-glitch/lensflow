"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, isSameDay } from "date-fns";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { checkLeadAvailability, bookLead } from "@/app/actions/leads";

type Slot = { start: string; end: string };

const NEXT_DAYS = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i + 1));

export function LeadBooking({ leadId, hasService }: { leadId: string; hasService: boolean }) {
  const [open, setOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function pickDay(day: Date) {
    setSelectedDay(day);
    setSlots(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await checkLeadAvailability(leadId, format(day, "yyyy-MM-dd"));
        setSlots(result.slots);
      } catch {
        setError("Couldn't load availability. Try again.");
      }
    });
  }

  function pickSlot(slot: Slot) {
    setError(null);
    startTransition(async () => {
      try {
        const { bookingId } = await bookLead(leadId, slot.start);
        router.push(`/dashboard/bookings/${bookingId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create the booking.");
      }
    });
  }

  if (!open) {
    return (
      <Button size="sm" className="w-full" onClick={() => setOpen(true)} disabled={!hasService}>
        Check Availability
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink/40">Pick a day</div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1">
        {NEXT_DAYS.map((day) => {
          const active = selectedDay && isSameDay(day, selectedDay);
          return (
            <button
              key={day.toISOString()}
              onClick={() => pickDay(day)}
              className={cn(
                "shrink-0 w-11 flex flex-col items-center py-2 rounded-lg border transition-colors",
                active ? "bg-ink text-white border-ink" : "bg-white text-ink border-border hover:border-ink/30"
              )}
            >
              <span className={cn("text-[10px] font-medium", active ? "text-white/60" : "text-ink/40")}>{format(day, "EEE")}</span>
              <span className="text-sm font-semibold mt-0.5">{format(day, "d")}</span>
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {pending && !slots ? (
        <p className="text-xs text-ink/40">Loading times…</p>
      ) : slots ? (
        slots.length === 0 ? (
          <p className="text-xs text-ink/40">No open slots this day.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {slots.map((slot) => (
              <button
                key={slot.start}
                disabled={pending}
                onClick={() => pickSlot(slot)}
                className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-border bg-white hover:border-accent hover:bg-accent-soft hover:text-accent-text transition-colors disabled:opacity-50"
              >
                {format(new Date(slot.start), "h:mm a")}
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
