"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, XCircle } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { Button, Field, Input } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { getRescheduleSlots, rescheduleBooking, cancelBooking } from "@/app/actions/bookings";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

/**
 * Move or cancel a booking. Slots come from the server (working hours minus other bookings,
 * buffers and connected-calendar busy time); the server checks again under a lock when the
 * move is saved, so a race with a public booking cannot double-book. The customer is told
 * on their conversation's channel, and the toast says whether that actually went out.
 */
export function RescheduleCancel({ bookingId, canCancel, canReschedule, timezone, currentStartISO }: { bookingId: string; canCancel: boolean; canReschedule: boolean; timezone: string; currentStartISO: string }) {
  const [open, setOpen] = useState<null | "move" | "cancel">(null);
  const [date, setDate] = useState(currentStartISO.slice(0, 10));
  const [slots, setSlots] = useState<Array<{ start: string; end: string }> | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" });

  useEffect(() => {
    if (open !== "move") return;
    setSlots(null);
    setPicked(null);
    getRescheduleSlots(bookingId, date).then(setSlots).catch(() => { setSlots([]); setError("Couldn't load times for that day. Try another date."); });
  }, [open, date, bookingId]);

  function move() {
    if (!picked) return;
    setError(null);
    start(async () => {
      const r = await rescheduleBooking(bookingId, picked, { notify });
      if (!r.ok) return setError(r.error);
      toast({ tone: "outcome", title: "Booking moved", body: r.notified === "sent" ? "The customer has been told." : r.notified === "not_delivered" ? "Saved to their thread, but that channel isn't connected, so they weren't notified — tell them yourself." : r.notified === "no_channel" ? "No way to reach the customer on file — tell them yourself." : "Customer not notified, as you chose.", ttl: 8000 });
      setOpen(null);
      router.refresh();
    });
  }
  function cancel() {
    start(async () => {
      const r = await cancelBooking(bookingId);
      if (!r.ok) return setError(r.error);
      toast({ tone: "neutral", title: "Booking canceled", body: "Removed from your calendars. The conversation is untouched." });
      setOpen(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {canReschedule && <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen("move")}><CalendarClock className="w-3.5 h-3.5 mr-1.5" strokeWidth={2} aria-hidden />Reschedule</Button>}
      {canCancel && <Button size="sm" variant="ghost" className="w-full text-danger-text hover:bg-danger-soft" onClick={() => setOpen("cancel")}><XCircle className="w-3.5 h-3.5 mr-1.5" strokeWidth={2} aria-hidden />Cancel booking</Button>}

      <BottomSheet open={open === "move"} onClose={() => setOpen(null)} title="Reschedule" subtitle="Pick a day, then a free time" icon={<CalendarClock className="w-4 h-4 text-ink" strokeWidth={2} aria-hidden />}>
        <div className="space-y-4">
          <Field id="resched-date" label="Day"><Input id="resched-date" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className="text-[16px] md:text-sm" /></Field>
          <div>
            <div className="text-[13px] font-semibold text-ink/80 mb-1.5">Free times</div>
            {slots === null ? (
              <p className="text-sm text-ink/50">Checking your calendar…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-ink/60">Nothing free that day — outside working hours, fully booked, or busy on a connected calendar.</p>
            ) : (
              <ul className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {slots.map((s) => (
                  <li key={s.start}><button type="button" onClick={() => setPicked(s.start)} className={cn("w-full h-10 rounded-xl border text-sm font-semibold tabular-nums transition-colors", picked === s.start ? "bg-ink text-white border-ink" : "bg-white border-border text-ink hover:bg-black/[0.03]")}>{fmt.format(new Date(s.start))}</button></li>
                ))}
              </ul>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink/75"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-4 h-4" /> Tell the customer on their thread</label>
          {error && <p role="alert" className="text-xs font-medium text-danger-text">{error}</p>}
          <div className="flex items-center gap-2"><Button onClick={move} disabled={!picked} loading={pending} loadingLabel="Moving">Move booking</Button><button type="button" onClick={() => setOpen(null)} className="text-xs font-semibold text-ink/55 px-2 py-1">Cancel</button></div>
        </div>
      </BottomSheet>

      <BottomSheet open={open === "cancel"} onClose={() => setOpen(null)} title="Cancel this booking?" subtitle="It comes off your calendars. Nothing else changes." icon={<XCircle className="w-4 h-4 text-danger-text" strokeWidth={2} aria-hidden />}>
        <p className="text-sm text-ink/70 leading-relaxed">The time becomes bookable again and the conversation is kept. Let the customer know yourself — no message is sent automatically.</p>
        {error && <p role="alert" className="mt-3 text-xs font-medium text-danger-text">{error}</p>}
        <div className="mt-4 flex items-center gap-2"><Button variant="danger" onClick={cancel} loading={pending} loadingLabel="Canceling">Cancel booking</Button><button type="button" onClick={() => setOpen(null)} className="text-xs font-semibold text-ink/55 px-2 py-1">Keep it</button></div>
      </BottomSheet>
      <p className="text-[10px] text-ink/40 mt-1">Current: {new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(currentStartISO))}</p>
    </div>
  );
}
