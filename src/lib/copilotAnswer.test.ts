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
  next: [
    { headline: "Maya needs your reply", why: "They wrote today; nothing has gone back yet.", value: { label: "Their budget: $500", known: true } },
    { headline: "Jordan may be going cold", why: "You replied 4 days ago; they haven't answered.", value: { label: "About $350, the service's price", known: false } },
  ],
  atRisk: { knownCents: 0, estimatedCents: 35000, people: 1 },
  quotes: [{ name: "Jordan Lee", cents: 35000, when: "4 days", answered: false, booked: false }],
  biggest: { name: "Maya Chen", label: "Their budget: $500", known: true },
  channels: null,
  medianReplyHours: null,
  sinceYesterday: { people: 1, bookings: 0 },
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

  it("says what to work on, in the engine's order, with money labelled", () => {
    const a = answerFromRecords("What should I work on today?", facts);
    expect(a).toMatch(/^In order:\n1\. Maya needs your reply/);
    expect(a).toContain("2. Jordan may be going cold");
    expect(a).toContain("(About $350, the service's price, estimate)");
  });
  it("answers who was quoted this week from the record, never from bookings", () => {
    const a = answerFromRecords("Who did I quote this week?", facts);
    expect(a).toContain("Jordan Lee — $350, 4 days ago · no reply yet");
    expect(a).not.toContain("Sam Okafor");
  });
  it("names the biggest opportunity and keeps estimates apart from known money", () => {
    const a = answerFromRecords("What is my biggest opportunity right now?", facts);
    expect(a).toContain("Maya Chen — Their budget: $500");
    expect(a).toContain("about $350 in service prices (an estimate)");
  });
  it("refuses to guess where leads come from on too little data", () => {
    const a = answerFromRecords("Where are most of my leads coming from?", facts);
    expect(a).toMatch(/^I don't have enough information/);
    expect(answerFromRecords("Where are my leads coming from?", { ...facts, channels: [{ channel: "Instagram", count: 7 }, { channel: "Email", count: 3 }] })).toContain("Most came from Instagram");
  });
  it("matches 'who needs a response' and 'what happened while I was away'", () => {
    expect(answerFromRecords("Who needs a response?", facts)).toMatch(/^2 people are waiting on a reply/);
    expect(answerFromRecords("What happened while I was away?", facts)).toMatch(/^Since yesterday: 1 new person wrote in and 0 bookings were made/);
  });
  it("says so when the records can't answer, instead of a status summary", () => {
    const a = answerFromRecords("What is my cancellation policy?", facts);
    expect(a).toMatch(/^I don't have enough information to determine that/);
  });
});
