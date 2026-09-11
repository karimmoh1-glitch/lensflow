/**
 * Turning a wall-clock time in a business's own timezone into a real instant.
 *
 * Booking slots, the day agenda, calendar export and the events Daythread writes into
 * Google Calendar all start as "9:00 on the 14th, in this business's zone". Five copies of
 * this conversion had grown across the codebase, all of them measuring the zone's offset at
 * the wrong instant: they read the wall-clock time as if it were UTC and asked what the
 * offset was *there*. On an ordinary day those two instants share an offset and the answer
 * is right. On the two days a year a zone changes, they can sit on opposite sides of the
 * change, and the answer comes out an hour off — 01:00 on the 29th of March in London
 * became midnight, and 01:00 on the 5th of April in Sydney became 02:00.
 *
 * The fix is to measure the offset at the instant being returned. One correction pass is
 * enough: the first guess is at most an hour out, so the second measurement lands in the
 * right offset period.
 */

/** How far the zone is behind UTC at this instant, in milliseconds (UTC-6 gives +6h). */
function offsetAt(instant: Date, timeZone: string): number {
  const asUtc = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" }));
  const asZoned = new Date(instant.toLocaleString("en-US", { timeZone }));
  return asUtc.getTime() - asZoned.getTime();
}

/** The wall-clock reading a person in that zone would see at this instant. */
function wallClockAt(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

const wanted = (year: number, month: number, day: number, hours: number, minutes: number, seconds: number) => {
  // Normalise through UTC so an out-of-range day (the 32nd) rolls over the way Date does.
  const d = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};

/**
 * Wall-clock parts in an IANA zone → the UTC instant they name.
 *
 * Two candidate instants are built, one from the offset at the wall-clock time read as UTC
 * and one from the offset where that first candidate landed. On an ordinary day both agree.
 * On a transition day only one of them reads back as the time that was asked for, and that
 * is the one returned — checking rather than assuming is what the old single-pass version
 * got wrong.
 *
 * A clock time the spring-forward skipped reads back as neither, and resolves to the later
 * candidate: the instant the clocks moved to, which is what a calendar does. A time that
 * happens twice because the clocks went back resolves to its first occurrence.
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hours: number, minutes: number, seconds: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
  try {
    const target = wanted(year, month, day, hours, minutes, seconds);
    const first = new Date(guess.getTime() + offsetAt(guess, timeZone));
    if (wallClockAt(first, timeZone) === target) return first;
    const second = new Date(guess.getTime() + offsetAt(first, timeZone));
    if (wallClockAt(second, timeZone) === target) return second;
    // The clocks skipped this reading. Land on the hour they moved to.
    return first > second ? first : second;
  } catch {
    // An unrecognised zone is treated as UTC rather than failing a booking outright.
    return guess;
  }
}

/** The same, given minutes from midnight — how availability windows and agendas are stored. */
export function zonedMinutesToUtc(year: number, month: number, day: number, minutesFromMidnight: number, timeZone: string): Date {
  return zonedTimeToUtc(year, month, day, Math.floor(minutesFromMidnight / 60), minutesFromMidnight % 60, 0, timeZone);
}

/** Today's calendar date in a zone, as the parts a person there would read off a wall calendar. */
export function zonedDateParts(instant: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}
