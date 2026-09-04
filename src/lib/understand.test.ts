import { describe, it, expect } from "vitest";
import { understand } from "./understand";

const base = { relationship: "CUSTOMER" as const, hasUpcomingBooking: true, upcomingBookingLabel: "Brand session · Fri 2:30 PM", hasOutstandingPayment: false };

describe("understand", () => {
  it("reads a confirmation with a day and time", () => {
    const u = understand({ ...base, body: "Thursday works! Can we do 3pm?" });
    expect(u.intent).toBe("CONFIRM");
    expect(u.day).toBe("Thursday");
    expect(u.time).toBe("3:00 PM");
    expect(u.context).toBe("Existing booking · Brand session · Fri 2:30 PM");
    expect(u.nextAction).toEqual({ label: "Confirm Thursday at 3:00 PM", kind: "confirm" });
    expect(u.confidence).toBe("high");
  });

  it("reads a reschedule", () => {
    const u = understand({ ...base, body: "Sam: can we move Thursday to 4?" });
    expect(u.intent).toBe("RESCHEDULE");
    expect(u.nextAction.kind).toBe("reschedule");
  });

  it("reads a pricing question from a new lead and proposes the right action", () => {
    const u = understand({ body: "Hi! What do you charge for a half day?", relationship: "LEAD", hasUpcomingBooking: false, hasOutstandingPayment: false });
    expect(u.intent).toBe("PRICING");
    expect(u.context).toBe("New inquiry");
    expect(u.nextAction.kind).toBe("reply");
  });

  it("reads availability and booking asks, with dates and money", () => {
    const a = understand({ body: "Are you free Saturday? Budget is around $500.", relationship: "LEAD", hasUpcomingBooking: false, hasOutstandingPayment: false });
    expect(a.intent).toBe("AVAILABILITY");
    expect(a.day).toBe("Saturday");
    expect(a.amountCents).toBe(50000);
    const b = understand({ body: "I'd like to book the family session on Sep 12", relationship: null, hasUpcomingBooking: false, hasOutstandingPayment: false });
    expect(b.intent).toBe("BOOK");
    expect(b.nextAction).toEqual({ label: "Book Sep 12", kind: "book" });
  });

  it("falls back honestly", () => {
    const u = understand({ body: "Got the photos!!", relationship: "CUSTOMER", hasUpcomingBooking: false, hasOutstandingPayment: false });
    expect(["THANKS", "UPDATE"]).toContain(u.intent);
    const q = understand({ body: "Do you also do video?", relationship: "LEAD", hasUpcomingBooking: false, hasOutstandingPayment: false });
    expect(q.intent).toBe("QUESTION");
    expect(q.confidence).toBe("low");
  });
});
