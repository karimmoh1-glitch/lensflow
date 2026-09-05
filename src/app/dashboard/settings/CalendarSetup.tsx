"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";
import { Button, WorkingDots } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { getCalendarState, saveCalendarSelection, syncCalendarNow, type CalendarState } from "@/app/actions/calendars";
import { disconnectIntegration } from "@/app/actions/connect";

/**
 * The calendar setup and manage experience for Google and Apple: which calendars block
 * availability, which one receives bookings, sync now, reconnect, disconnect. Every
 * fact on screen comes from the server; nothing here is local make-believe.
 */
export function CalendarSetup({ provider, mode, onDone, reconnect }: { provider: "GOOGLE_CALENDAR" | "APPLE_CALENDAR"; mode: "setup" | "manage"; onDone?: () => void; reconnect?: React.ReactNode }) {
  const [state, setState] = useState<CalendarState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bookingCalendar, setBookingCalendar] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"save" | "sync" | "refresh" | "disconnect" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const name = provider === "GOOGLE_CALENDAR" ? "Google Calendar" : "Apple Calendar";

  const load = (refresh = false) => {
    setBusy(refresh ? "refresh" : null);
    start(async () => {
      const s = await getCalendarState(provider, { refresh });
      setState(s);
      setSelected(s.selected);
      setBookingCalendar(s.bookingCalendar);
      setBusy(null);
    });
  };
  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const dirty = state ? JSON.stringify([...selected].sort()) !== JSON.stringify([...state.selected].sort()) || bookingCalendar !== state.bookingCalendar : false;

  function toggle(id: string) {
    setSelected((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      if (bookingCalendar && !next.includes(bookingCalendar)) setBookingCalendar(next[0] ?? null);
      if (!bookingCalendar && next.length) setBookingCalendar(next[0]);
      return next;
    });
  }

  function save() {
    setBusy("save");
    start(async () => {
      const r = await saveCalendarSelection({ provider, selected, bookingCalendar });
      setBusy(null);
      if (r.error) return toast({ tone: "signal", title: "Couldn't save calendars", body: r.error });
      toast({ tone: "outcome", title: `${selected.length} calendar${selected.length === 1 ? "" : "s"} connected`, body: `Busy time now blocks availability${r.synced ? ` · ${r.synced} event${r.synced === 1 ? "" : "s"} synced` : ""}.` });
      router.refresh();
      if (mode === "setup") onDone?.();
      else load(false);
    });
  }
  function sync() {
    setBusy("sync");
    start(async () => {
      const r = await syncCalendarNow(provider);
      setBusy(null);
      if (!r.ok) return toast({ tone: "signal", title: "Sync failed", body: r.error ?? "Daythread will retry automatically." });
      toast({ tone: "outcome", title: "Synced", body: `${r.upserted ?? 0} event${r.upserted === 1 ? "" : "s"} updated.` });
      router.refresh();
      load(false);
    });
  }
  function disconnect() {
    setBusy("disconnect");
    start(async () => {
      const r = await disconnectIntegration(provider);
      setBusy(null);
      if (r.error) return toast({ tone: "signal", title: "Couldn't disconnect", body: r.error });
      toast({ tone: "neutral", title: `${name} disconnected`, body: "Access has stopped. Your Daythread bookings are untouched." });
      router.refresh();
      onDone?.();
    });
  }

  if (!state) return <div className="py-10 flex items-center justify-center text-sm text-ink/50"><WorkingDots /><span className="ml-2">Loading calendars</span></div>;
  if (!state.connected) return <p className="text-sm text-ink/60">{name} isn&rsquo;t connected.</p>;

  const needsAttention = state.status === "NEEDS_ATTENTION";
  const syncIssue = state.status === "SYNC_ERROR" || state.lastSyncStatus === "failed";

  return (
    <div className="space-y-5">
      {mode === "setup" && (
        <div className="rounded-2xl bg-success-soft/60 border border-success/25 px-4 py-3">
          <div className="text-sm font-semibold text-success-text">Connected successfully.</div>
          <div className="text-xs text-ink/65 mt-0.5">{state.account ? `Signed in as ${state.account}. ` : ""}Choose which calendars Daythread should use.</div>
        </div>
      )}

      {needsAttention && (
        <div role="alert" className="rounded-2xl bg-accent-soft border border-accent/30 px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 text-sm text-ink/80"><span className="font-semibold text-ink">Your {name} connection needs to be renewed.</span> {state.lastError ?? ""}</div>
          {reconnect}
        </div>
      )}
      {syncIssue && !needsAttention && (
        <div role="status" className="rounded-2xl bg-warning-soft/60 border border-warning/40 px-4 py-3 text-sm text-ink/80">
          <span className="font-semibold text-ink">Calendar sync temporarily failed.</span> Daythread will retry automatically{state.lastSyncedAt ? ` · last good sync ${formatDistanceToNowStrict(new Date(state.lastSyncedAt))} ago` : ""}.
        </div>
      )}

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/45">Calendars to use with Daythread</h4>
          <button type="button" onClick={() => load(true)} disabled={pending} className="text-[11px] font-semibold text-ink/50 hover:text-ink">{busy === "refresh" ? "Refreshing…" : "Refresh list"}</button>
        </div>
        {state.error && <p className="mt-1 text-xs text-warning-text">{state.error}</p>}
        <ul className="mt-2 space-y-1.5">
          {state.available.map((c) => {
            const on = selected.includes(c.id);
            return (
              <li key={c.id} className={cn("rounded-xl border px-3.5 py-2.5 flex items-center gap-3 transition-colors", on ? "border-signal/40 bg-signal-soft/30" : "border-border bg-white hover:border-ink/20")}>
                <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                  <input type="checkbox" checked={on} onChange={() => toggle(c.id)} className="w-4 h-4 accent-[#6D5AE6]" aria-label={`Use ${c.name}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink truncate">{c.name}{c.primary ? <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/40">primary</span> : null}</span>
                    <span className="block text-[11px] text-ink/50">{c.readOnly ? "Read-only · busy time only" : "Busy time blocks availability"}</span>
                  </span>
                </label>
                {on && !c.readOnly && (
                  <label className={cn("shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2 py-1 cursor-pointer", bookingCalendar === c.id ? "bg-ink text-white" : "text-ink/55 hover:bg-black/[0.05]")}>
                    <input type="radio" name="booking-calendar" className="sr-only" checked={bookingCalendar === c.id} onChange={() => setBookingCalendar(c.id)} />
                    {bookingCalendar === c.id ? "Bookings go here" : "Send bookings here"}
                  </label>
                )}
              </li>
            );
          })}
          {state.available.length === 0 && <li className="text-sm text-ink/55">No calendars found on this account.</li>}
        </ul>
        <p className="mt-2 text-[11px] text-ink/45">Daythread bookings stay the source of truth. Events on these calendars only block your availability; they never change a booking.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={selected.length === 0 || (mode === "manage" && !dirty)} loading={busy === "save"} loadingLabel="Saving and syncing">{mode === "setup" ? "Save calendars" : "Save changes"}</Button>
        {mode === "manage" && <Button size="sm" variant="outline" onClick={sync} loading={busy === "sync"} loadingLabel="Syncing">Sync now</Button>}
        {mode === "setup" && <button type="button" onClick={onDone} className="text-xs text-ink/50 px-2 py-1">Do this later</button>}
      </div>

      {mode === "manage" && (
        <dl className="grid grid-cols-2 gap-3 text-xs border-t border-border pt-4">
          <div><dt className="text-ink/45">Account</dt><dd className="font-semibold text-ink truncate">{state.account ?? "—"}</dd></div>
          <div><dt className="text-ink/45">Last synced</dt><dd className="font-semibold text-ink">{state.lastSyncedAt ? `${formatDistanceToNowStrict(new Date(state.lastSyncedAt))} ago` : "Not yet"}</dd></div>
          <div><dt className="text-ink/45">Busy blocks ahead</dt><dd className="font-semibold text-ink tabular-nums">{state.busyBlocks}</dd></div>
          <div><dt className="text-ink/45">Status</dt><dd className={cn("font-semibold", needsAttention ? "text-accent-text" : syncIssue ? "text-warning-text" : "text-success-text")}>{needsAttention ? "Needs attention" : syncIssue ? "Sync issue" : "Healthy"}</dd></div>
        </dl>
      )}

      {mode === "manage" && (
        <div className="border-t border-border pt-4">
          <details className="text-xs text-ink/55">
            <summary className="cursor-pointer select-none hover:text-ink">Troubleshooting</summary>
            <ul className="mt-2 space-y-1 list-disc pl-4">
              <li>A booking isn&rsquo;t on the calendar: it goes to the calendar marked &ldquo;Bookings go here&rdquo; — check that one is selected, then Sync now.</li>
              <li>A slot is blocked you didn&rsquo;t expect: an event on a selected calendar overlaps it. Untick that calendar or mark the event as &ldquo;free&rdquo; in your calendar.</li>
              <li>{provider === "GOOGLE_CALENDAR" ? "Google shows a permissions error: reconnect and approve calendar access." : "Apple rejected the sign-in: create a fresh app-specific password at appleid.apple.com and reconnect."}</li>
            </ul>
          </details>
          <div className="mt-4">
            {!confirm ? (
              <button type="button" onClick={() => setConfirm(true)} className="text-xs font-semibold text-danger-text hover:underline">Disconnect {name}</button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink/65">Stops sync and removes Daythread&rsquo;s events from the calendar. Your bookings stay.</span>
                <Button size="sm" variant="danger" onClick={disconnect} loading={busy === "disconnect"} loadingLabel="Disconnecting">Disconnect</Button>
                <button type="button" onClick={() => setConfirm(false)} className="text-ink/50">Keep</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
