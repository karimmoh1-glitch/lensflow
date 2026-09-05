"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toaster";
import { listGoogleCalendarsForSettings, selectGoogleCalendar } from "@/app/actions/googleAuth";
import { listAppleCalendarsForSettings, selectAppleCalendar } from "@/app/actions/connect";
import { WorkingDots } from "@/components/ui";

/** Which calendar bookings go to, and which one's busy time blocks availability. */
export function CalendarPicker({ provider, selectedName }: { provider: "GOOGLE_CALENDAR" | "APPLE_CALENDAR"; selectedName: string | null }) {
  const [options, setOptions] = useState<Array<{ id: string; name: string }> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    let live = true;
    (async () => {
      const r = provider === "GOOGLE_CALENDAR" ? await listGoogleCalendarsForSettings().then((x) => ({ items: x.calendars.map((c) => ({ id: c.id, name: c.primary ? `${c.name} (primary)` : c.name })), selected: x.selected, error: x.error })) : await listAppleCalendarsForSettings().then((x) => ({ items: x.calendars.map((c) => ({ id: c.href, name: c.name })), selected: x.selected, error: x.error }));
      if (!live) return;
      setOptions(r.items);
      setSelected(r.selected);
      if (r.error) setError("Couldn't list calendars right now.");
    })();
    return () => {
      live = false;
    };
  }, [provider]);

  function choose(id: string) {
    const name = options?.find((o) => o.id === id)?.name ?? "Calendar";
    setSelected(id);
    start(async () => {
      const r = provider === "GOOGLE_CALENDAR" ? await selectGoogleCalendar(id, name) : await selectAppleCalendar(id, name);
      if (r.error) return toast({ tone: "signal", title: "Couldn't switch calendar", body: r.error });
      toast({ tone: "thinking", title: `Using ${name}`, body: "Bookings go here; its busy time blocks your availability." });
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap text-xs">
      <label htmlFor={`cal-${provider}`} className="text-ink/60">Calendar</label>
      {options === null ? (
        <span className="inline-flex items-center gap-2 text-ink/50"><WorkingDots /> {selectedName ?? "Loading"}</span>
      ) : (
        <select id={`cal-${provider}`} value={selected ?? ""} onChange={(e) => choose(e.target.value)} disabled={pending} className="h-8 rounded-lg border border-border bg-white px-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      )}
      {pending && <WorkingDots />}
      {error && <span className="text-warning-text">{error}</span>}
      <span className="text-ink/45">Bookings are the source of truth; edits on the calendar never change a booking.</span>
    </div>
  );
}
