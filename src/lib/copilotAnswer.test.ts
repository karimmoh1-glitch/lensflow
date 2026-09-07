import { describe, it, expect } from "vitest";
import { answerFromRecords, type BusinessFacts } from "./copilotAnswer";

const facts: BusinessFacts = {
  businessName: "Pivot Studio",
  timezone: "America/Chicago",
  customers: 1,
  openInquiries: [{ name: "Maya Chen", service: "Brand session", wants: "Tuesday" }, { name: "Priya Patel", service: null, wants: null }],
  waiting: [{ name: "Maya Chen", ago: "27 minutes" }, { name: "Jordan Lee", ago: "9 hours" }],
  cold: ["Jordan Lee"],
  upcoming: [{ name: "Sam Okafor", service: "Brand session", when: "Thu Sep 10 at 4:00 PM", dayKey: "2026-09-10", location: "Studio", confirmed: false }],
  calendars: [],
  todayKey: "2026-09-06",
  weekKeys: ["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"],
};

describe("answerFromRecords", () => {
  it("answers who is waiting with names and how long", () => {
    const a = answerFromRecords("Who is waiting on me right now?", facts);
    expect(a).toMatch(/^2 people are waiting on a reply/);
    expect(a).toContain("Maya Chen — wrote 27 minutes ago");
    expect(a).toContain("Jordan Lee");
  });
  it("answers the calendar for the week including confirmation state", () => {
    const a = answerFromRecords("What's on my calendar this week?", facts);
    expect(a).toContain("Sam Okafor, Brand session at Studio (not confirmed)");
    expect(a).toContain("1 booking still needs confirming");
  });
  it("answers going cold and not confirmed", () => {
    expect(answerFromRecords("Which inquiries are going cold?", facts)).toContain("Jordan Lee");
    expect(answerFromRecords("Is anything not confirmed yet?", facts)).toContain("Sam Okafor — Brand session, Thu Sep 10 at 4:00 PM");
  });
  it("answers today and tomorrow from the day keys, in the business timezone", () => {
    expect(answerFromRecords("What's on today?", facts)).toBe("Nothing is on the calendar today.");
    expect(answerFromRecords("anything tomorrow?", facts)).toBe("Nothing is on the calendar tomorrow.");
    expect(answerFromRecords("what's today", { ...facts, todayKey: "2026-09-10" })).toContain("Sam Okafor");
  });
  it("never claims an action and gives an overview for anything else", () => {
    const a = answerFromRecords("Book Maya for Tuesday", facts);
    expect(a).not.toMatch(/booked|sent|done/i);
    expect(a).toContain("Here's where Pivot Studio stands");
  });
  it("is honest about empty states", () => {
    const empty: BusinessFacts = { ...facts, waiting: [], cold: [], upcoming: [], openInquiries: [] };
    expect(answerFromRecords("who is waiting?", empty)).toContain("Nobody is waiting on you");
    expect(answerFromRecords("anything going cold?", empty)).toContain("No inquiries are going cold");
    expect(answerFromRecords("unconfirmed bookings?", empty)).toContain("no upcoming bookings");
    expect(answerFromRecords("is google calendar synced?", empty)).toContain("Settings → Channels");
  });
});
