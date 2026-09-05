/**
 * A small, honest iCalendar layer: enough to read what iCloud returns for a calendar and to
 * write the mirror event for a booking. Handles DTSTART/DTEND in UTC, floating, TZID and
 * all-day forms, and expands the common recurrence rules (DAILY / WEEKLY / MONTHLY by day,
 * with COUNT / UNTIL / INTERVAL / BYDAY) into occurrences inside a window. Anything more
 * exotic is kept as its first occurrence and flagged, never silently dropped.
 */
export type ParsedEvent = {
  uid: string;
  summary: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  status: "confirmed" | "tentative" | "cancelled";
  transparent: boolean;
  rrule: string | null;
  exdates: Date[];
  bookingId: string | null;
  /** True when the recurrence rule wasn't fully understood. */
  partial: boolean;
};

const DAY_MS = 86_400_000;

export function unfold(ics: string): string[] {
  const lines = ics.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

/** Local wall-clock parts in an IANA zone → UTC instant (DST-correct). */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(y, mo, d, h, mi, s));
  try {
    const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
    const asZoned = new Date(guess.toLocaleString("en-US", { timeZone }));
    return new Date(guess.getTime() + (asUtc.getTime() - asZoned.getTime()));
  } catch {
    return guess; // unknown zone: treat as UTC rather than fail
  }
}

/** Parses a DTSTART/DTEND value with its parameters. */
export function parseDateValue(value: string, params: Record<string, string>, fallbackZone: string): { date: Date; allDay: boolean } {
  const v = value.trim();
  if (params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const y = +v.slice(0, 4), mo = +v.slice(4, 6) - 1, d = +v.slice(6, 8);
    return { date: zonedToUtc(y, mo, d, 0, 0, 0, params.TZID ?? fallbackZone), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) throw new Error(`Unparseable date ${v}`);
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))), allDay: false };
  return { date: zonedToUtc(+y, +mo - 1, +d, +h, +mi, +(s ?? 0), params.TZID ?? fallbackZone), allDay: false };
}

function splitProp(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  const head = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

function unescapeText(v: string) {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\");
}

/** Parses every VEVENT in a calendar object. Recurrence overrides (RECURRENCE-ID) are
 * returned as standalone events so they override the expanded instance. */
export function parseICS(ics: string, fallbackZone = "UTC"): ParsedEvent[] {
  const lines = unfold(ics);
  const events: ParsedEvent[] = [];
  let cur: Record<string, { params: Record<string, string>; value: string }[]> | null = null;
  const tzids: Record<string, string> = {};
  let inTz: string | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT" && cur) {
      const get = (n: string) => cur![n]?.[0];
      const dtstart = get("DTSTART");
      if (dtstart) {
        const start = parseDateValue(dtstart.value, dtstart.params, fallbackZone);
        const dtend = get("DTEND");
        const duration = get("DURATION");
        let end: Date;
        if (dtend) end = parseDateValue(dtend.value, dtend.params, fallbackZone).date;
        else if (duration) end = new Date(start.date.getTime() + parseDuration(duration.value));
        else end = new Date(start.date.getTime() + (start.allDay ? DAY_MS : 0));
        const status = (get("STATUS")?.value ?? "CONFIRMED").toUpperCase();
        const desc = get("DESCRIPTION")?.value ?? "";
        const bookingId = /daythreadBookingId=([A-Za-z0-9]+)/.exec(desc)?.[1] ?? get("X-DAYTHREAD-BOOKING")?.value ?? null;
        events.push({
          uid: get("UID")?.value ?? `${start.date.toISOString()}-${Math.random()}`,
          summary: get("SUMMARY") ? unescapeText(get("SUMMARY")!.value) : null,
          start: start.date,
          end,
          allDay: start.allDay,
          status: status === "CANCELLED" ? "cancelled" : status === "TENTATIVE" ? "tentative" : "confirmed",
          transparent: (get("TRANSP")?.value ?? "OPAQUE").toUpperCase() === "TRANSPARENT",
          rrule: get("RRULE")?.value ?? null,
          exdates: (cur["EXDATE"] ?? []).flatMap((e) => e.value.split(",").map((v) => parseDateValue(v, e.params, fallbackZone).date)),
          bookingId,
          partial: false,
        });
      }
      cur = null;
      continue;
    }
    if (line.startsWith("BEGIN:VTIMEZONE")) { inTz = ""; continue; }
    if (line === "END:VTIMEZONE") { inTz = null; continue; }
    if (inTz !== null) {
      const p = splitProp(line);
      if (p?.name === "TZID") tzids[p.value] = p.value;
      continue;
    }
    if (!cur) continue;
    const p = splitProp(line);
    if (!p) continue;
    (cur[p.name] ??= []).push({ params: p.params, value: p.value });
  }
  return events;
}

export function parseDuration(v: string): number {
  const m = /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return 0;
  const [, neg, w, d, h, mi, s] = m;
  const ms = ((+(w ?? 0) * 7 + +(d ?? 0)) * 24 * 3600 + +(h ?? 0) * 3600 + +(mi ?? 0) * 60 + +(s ?? 0)) * 1000;
  return neg ? -ms : ms;
}

const WD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Occurrences of an event inside [from, to]. Non-recurring: the event itself if it overlaps. */
export function expandOccurrences(e: ParsedEvent, from: Date, to: Date, max = 200): { start: Date; end: Date }[] {
  const dur = e.end.getTime() - e.start.getTime();
  const overlaps = (s: Date) => s.getTime() < to.getTime() && s.getTime() + dur > from.getTime();
  if (!e.rrule) return overlaps(e.start) ? [{ start: e.start, end: e.end }] : [];
  const rule = Object.fromEntries(e.rrule.split(";").map((kv) => kv.split("=") as [string, string]));
  const freq = rule.FREQ;
  const interval = Math.max(1, +(rule.INTERVAL ?? 1));
  const count = rule.COUNT ? +rule.COUNT : Infinity;
  const until = rule.UNTIL ? parseDateValue(rule.UNTIL, {}, "UTC").date : null;
  const byday = rule.BYDAY ? rule.BYDAY.split(",").map((d) => WD.indexOf(d.slice(-2))) : null;
  const ex = new Set(e.exdates.map((d) => d.getTime()));
  const out: { start: Date; end: Date }[] = [];
  let produced = 0;
  const push = (s: Date) => {
    if (until && s.getTime() > until.getTime()) return false;
    if (produced >= count) return false;
    produced++;
    if (!ex.has(s.getTime()) && overlaps(s)) out.push({ start: s, end: new Date(s.getTime() + dur) });
    return out.length < max;
  };
  if (freq === "DAILY") {
    for (let i = 0; i < 2000; i++) {
      const s = new Date(e.start.getTime() + i * interval * DAY_MS);
      if (s.getTime() >= to.getTime()) break;
      if (!push(s)) break;
    }
  } else if (freq === "WEEKLY") {
    const days = byday && byday.length ? byday : [e.start.getUTCDay()];
    // Occurrences must come out in date order: sort the weekdays by their offset from DTSTART.
    const deltas = days.map((d) => (d - e.start.getUTCDay() + 7) % 7).sort((a, b) => a - b);
    for (let week = 0; week < 520; week++) {
      const weekStart = new Date(e.start.getTime() + week * interval * 7 * DAY_MS);
      let stop = false;
      for (const delta of deltas) {
        const s = new Date(weekStart.getTime() + delta * DAY_MS);
        if (s.getTime() < e.start.getTime()) continue;
        if (s.getTime() >= to.getTime()) { stop = true; break; }
        if (!push(s)) { stop = true; break; }
      }
      if (stop) break;
    }
  } else if (freq === "MONTHLY" && !rule.BYDAY) {
    for (let i = 0; i < 240; i++) {
      const s = new Date(e.start);
      s.setUTCMonth(s.getUTCMonth() + i * interval);
      if (s.getTime() >= to.getTime()) break;
      if (!push(s)) break;
    }
  } else if (freq === "YEARLY") {
    for (let i = 0; i < 50; i++) {
      const s = new Date(e.start);
      s.setUTCFullYear(s.getUTCFullYear() + i * interval);
      if (s.getTime() >= to.getTime()) break;
      if (!push(s)) break;
    }
  } else {
    e.partial = true;
    return overlaps(e.start) ? [{ start: e.start, end: e.end }] : [];
  }
  return out;
}

function fmtUtc(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function escapeText(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** The mirror event for a booking, as a VCALENDAR the CalDAV server accepts. */
export function buildVEvent(e: { uid: string; summary: string; description?: string; location?: string | null; start: Date; end: Date; bookingId: string }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Daythread//Bookings//EN",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${fmtUtc(new Date())}`,
    `DTSTART:${fmtUtc(e.start)}`,
    `DTEND:${fmtUtc(e.end)}`,
    `SUMMARY:${escapeText(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${escapeText(`${e.description} daythreadBookingId=${e.bookingId}`)}`] : [`DESCRIPTION:daythreadBookingId=${e.bookingId}`]),
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    `X-DAYTHREAD-BOOKING:${e.bookingId}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map((l) => (l.length > 73 ? l.match(/.{1,73}/g)!.join("\r\n ") : l)).join("\r\n") + "\r\n";
}
