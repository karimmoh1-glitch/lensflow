import { describe, it, expect } from "vitest";
import { parseICS, expandOccurrences, buildVEvent, zonedToUtc } from "./ics";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:a1
SUMMARY:Dentist
DTSTART;TZID=America/New_York:20260310T090000
DTEND;TZID=America/New_York:20260310T100000
END:VEVENT
BEGIN:VEVENT
UID:a2
SUMMARY:Offsite
DTSTART;VALUE=DATE:20260401
DTEND;VALUE=DATE:20260402
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
UID:a3
SUMMARY:Standup
DTSTART:20260901T130000Z
DTEND:20260901T131500Z
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6
EXDATE:20260904T130000Z
END:VEVENT
END:VCALENDAR`;

describe("ics", () => {
  it("parses TZID, UTC and all-day forms, and DST-correct instants", () => {
    const ev = parseICS(ICS, "UTC");
    expect(ev).toHaveLength(3);
    // March 10 2026 is after the US DST switch (Mar 8): 09:00 New York = 13:00Z
    expect(ev[0].start.toISOString()).toBe("2026-03-10T13:00:00.000Z");
    expect(ev[1].allDay).toBe(true);
    expect(ev[1].transparent).toBe(true);
    expect(ev[2].rrule).toContain("WEEKLY");
    // Before DST (Jan): 09:00 New York = 14:00Z
    expect(zonedToUtc(2026, 0, 15, 9, 0, 0, "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });
  it("expands weekly BYDAY with COUNT and honours EXDATE", () => {
    const ev = parseICS(ICS)[2];
    const occ = expandOccurrences(ev, new Date("2026-08-01T00:00:00Z"), new Date("2026-10-01T00:00:00Z"));
    // Tue Sep 1 start; BYDAY MO,WE,FR from that week: Wed 2, Fri 4 (excluded), Mon 7, Wed 9, Fri 11, Mon 14 → COUNT 6 counted before exclusion
    const days = occ.map((o) => o.start.toISOString().slice(0, 10));
    expect(days).toEqual(["2026-09-02", "2026-09-07", "2026-09-09", "2026-09-11", "2026-09-14"]);
    expect(occ[0].end.getTime() - occ[0].start.getTime()).toBe(15 * 60 * 1000);
  });
  it("keeps a non-recurring event only when it overlaps the window", () => {
    const ev = parseICS(ICS)[0];
    expect(expandOccurrences(ev, new Date("2026-03-01T00:00:00Z"), new Date("2026-03-31T00:00:00Z"))).toHaveLength(1);
    expect(expandOccurrences(ev, new Date("2026-05-01T00:00:00Z"), new Date("2026-05-31T00:00:00Z"))).toHaveLength(0);
  });
  it("builds a mirror event that parses back with its booking marker", () => {
    const ics = buildVEvent({ uid: "daythread-b1@daythread.org", summary: "Brand session · Sarah, Kim", description: "Booked through Daythread.", location: "Zilker Park", start: new Date("2026-09-12T19:30:00Z"), end: new Date("2026-09-12T21:00:00Z"), bookingId: "b1" });
    const [ev] = parseICS(ics);
    expect(ev.uid).toBe("daythread-b1@daythread.org");
    expect(ev.summary).toBe("Brand session · Sarah, Kim");
    expect(ev.bookingId).toBe("b1");
    expect(ev.start.toISOString()).toBe("2026-09-12T19:30:00.000Z");
  });
});
