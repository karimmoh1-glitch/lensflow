import { describe, it, expect } from "vitest";
import { zonedTimeToUtc, zonedMinutesToUtc, zonedDateParts } from "@/lib/timezone";

/**
 * Booking slots, the day agenda, calendar export and the events written into Google
 * Calendar all begin as a wall-clock time in the business's own zone. Five copies of that
 * conversion measured the zone's offset at the wrong instant, so on the two days a year a
 * zone changes, times near the change came out an hour wrong: 01:00 on the 29th of March
 * in London became midnight, and 01:00 on the 5th of April in Sydney became 02:00. Those
 * are the cases below, alongside ordinary days that must not move.
 */
const localTime = (instant: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);

const localDate = (instant: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);

describe("wall-clock time in a business's zone", () => {
  it("reads back the same clock time on an ordinary day, anywhere", () => {
    const cases: Array<[string, number, number, number, number, number]> = [
      ["America/Chicago", 2026, 5, 15, 9, 0],
      ["America/New_York", 2026, 0, 20, 16, 30],
      ["Europe/London", 2026, 6, 2, 9, 15],
      ["Australia/Sydney", 2026, 8, 10, 14, 45],
      ["Asia/Kolkata", 2026, 5, 15, 9, 30],
      ["Pacific/Auckland", 2026, 4, 4, 11, 0],
      ["UTC", 2026, 2, 1, 0, 0],
    ];
    for (const [zone, y, mo, d, h, mi] of cases) {
      const instant = zonedTimeToUtc(y, mo, d, h, mi, 0, zone);
      expect(localTime(instant, zone), `${zone} ${y}-${mo + 1}-${d}`).toBe(`${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`);
      expect(localDate(instant, zone), `${zone} date`).toBe(`${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  });

  it("keeps early-morning times honest on the day the clocks go forward", () => {
    // London springs forward at 01:00 GMT on 29 March 2026: the clock reads 00:59 and then
    // 02:00, so 01:00 never happens there. Either side of it has to read back unchanged.
    expect(localTime(zonedTimeToUtc(2026, 2, 29, 0, 30, 0, "Europe/London"), "Europe/London")).toBe("00:30");
    expect(localTime(zonedTimeToUtc(2026, 2, 29, 3, 0, 0, "Europe/London"), "Europe/London")).toBe("03:00");
    expect(localTime(zonedTimeToUtc(2026, 2, 29, 9, 0, 0, "Europe/London"), "Europe/London")).toBe("09:00");

    // Auckland springs forward at 02:00 on 27 September 2026.
    expect(localTime(zonedTimeToUtc(2026, 8, 27, 1, 0, 0, "Pacific/Auckland"), "Pacific/Auckland")).toBe("01:00");
    expect(localTime(zonedTimeToUtc(2026, 8, 27, 9, 0, 0, "Pacific/Auckland"), "Pacific/Auckland")).toBe("09:00");

    // The skipped reading itself resolves to the hour the clocks moved to, on the right day.
    const skipped = zonedTimeToUtc(2026, 2, 29, 1, 0, 0, "Europe/London");
    expect(localDate(skipped, "Europe/London")).toBe("2026-03-29");
    expect(localTime(skipped, "Europe/London")).toBe("02:00");

    // Chicago springs forward at 02:00 on 8 March 2026.
    expect(localTime(zonedTimeToUtc(2026, 2, 8, 1, 0, 0, "America/Chicago"), "America/Chicago")).toBe("01:00");
    expect(localTime(zonedTimeToUtc(2026, 2, 8, 9, 0, 0, "America/Chicago"), "America/Chicago")).toBe("09:00");
  });

  it("keeps early-morning times honest on the day the clocks go back", () => {
    // Sydney falls back at 03:00 on 5 April 2026; 01:00 must stay 01:00.
    expect(localTime(zonedTimeToUtc(2026, 3, 5, 1, 0, 0, "Australia/Sydney"), "Australia/Sydney")).toBe("01:00");
    expect(localTime(zonedTimeToUtc(2026, 3, 5, 9, 0, 0, "Australia/Sydney"), "Australia/Sydney")).toBe("09:00");

    // Chicago falls back at 02:00 on 1 November 2026. 01:00 happens twice; the first one
    // is the conventional answer, and either way it must read back as 01:00.
    expect(localTime(zonedTimeToUtc(2026, 10, 1, 1, 0, 0, "America/Chicago"), "America/Chicago")).toBe("01:00");
    expect(localTime(zonedTimeToUtc(2026, 10, 1, 9, 0, 0, "America/Chicago"), "America/Chicago")).toBe("09:00");

    // London falls back at 02:00 on 25 October 2026.
    expect(localTime(zonedTimeToUtc(2026, 9, 25, 1, 0, 0, "Europe/London"), "Europe/London")).toBe("01:00");
  });

  it("a clock time the spring-forward skipped lands on the hour the clocks moved to", () => {
    // 02:30 does not exist in Chicago on 8 March 2026. It must not throw, and it must not
    // silently land on the previous day.
    const instant = zonedTimeToUtc(2026, 2, 8, 2, 30, 0, "America/Chicago");
    expect(localDate(instant, "America/Chicago")).toBe("2026-03-08");
    expect(localTime(instant, "America/Chicago")).toBe("03:30");
  });

  it("midnight and end-of-day bound the right calendar day on a transition day", () => {
    // These two calls are how the agenda and the slot finder fence a day. Getting them
    // wrong on a transition day shifts every booking on that page.
    const start = zonedMinutesToUtc(2026, 2, 29, 0, "Europe/London");
    const end = zonedMinutesToUtc(2026, 2, 29, 24 * 60, "Europe/London");
    expect(localDate(start, "Europe/London")).toBe("2026-03-29");
    expect(localTime(start, "Europe/London")).toBe("00:00");
    expect(localDate(end, "Europe/London")).toBe("2026-03-30");
    expect(localTime(end, "Europe/London")).toBe("00:00");
    // A spring-forward day is 23 hours long, not 24.
    expect(end.getTime() - start.getTime()).toBe(23 * 3_600_000);
  });

  it("an unrecognised zone is treated as UTC rather than failing a booking", () => {
    const instant = zonedTimeToUtc(2026, 5, 15, 9, 0, 0, "Not/AZone");
    expect(instant.toISOString()).toBe("2026-06-15T09:00:00.000Z");
  });

  it("reads the calendar date a person in that zone would see", () => {
    // 03:00 UTC on 15 June is still the 14th in Chicago.
    const instant = new Date("2026-06-15T03:00:00.000Z");
    expect(zonedDateParts(instant, "America/Chicago")).toEqual({ year: 2026, month: 5, day: 14 });
    expect(zonedDateParts(instant, "UTC")).toEqual({ year: 2026, month: 5, day: 15 });
    expect(zonedDateParts(instant, "Australia/Sydney")).toEqual({ year: 2026, month: 5, day: 15 });
  });
});
