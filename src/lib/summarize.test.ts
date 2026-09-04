import { describe, it, expect } from "vitest";
import { summarizeDeterministically } from "./summarize";

describe("summarizeDeterministically", () => {
  it("turns a messy inquiry into a sentence, details, status and next step", () => {
    const s = summarizeDeterministically({
      personName: "Ahmed Mantawy",
      relationship: "LEAD",
      channel: "EMAIL",
      messages: [
        { direction: "INBOUND", body: "Hi, are you available for a session in September?", createdAt: new Date("2026-08-29") },
        { direction: "OUTBOUND", body: "Where were you thinking, and what's your budget?", createdAt: new Date("2026-08-30") },
        { direction: "INBOUND", body: "I'd like to book. The location will be at Redmond Town Center. My budget is $500, and I want this done for my newborn child.\n\nOn Sun, Aug 30, 2026 at 4:35 PM Alex wrote:\n> Where were you thinking?", createdAt: new Date("2026-08-31") },
      ],
      lead: { serviceName: "Newborn session", requestedLocation: "Redmond Town Center", budgetCents: 50000, status: "CONTACTED", respondedAt: new Date("2026-08-30") },
    });
    expect(s.summary).toBe("Ahmed wants to book a newborn session at Redmond Town Center with a $500 budget.");
    expect(s.details).toEqual(expect.arrayContaining([{ label: "Location", value: "Redmond Town Center" }, { label: "Budget", value: "$500" }, { label: "Service", value: "Newborn session" }]));
    expect(s.status).toBe("In conversation");
    expect(s.nextStep).toBe("Send the booking link.");
    expect(s.source).toBe("rules");
  });
  it("reads a confirmation against an existing booking", () => {
    const s = summarizeDeterministically({ personName: "Sarah Kim", relationship: "CUSTOMER", channel: "SMS", messages: [{ direction: "INBOUND", body: "Thursday works! Can we do 3pm?", createdAt: new Date() }], upcomingBookingLabel: "Brand session · Fri 2:30 PM" });
    expect(s.summary).toBe("Sarah is confirming Thursday at 3:00 PM.");
    expect(s.status).toBe("Booked");
    expect(s.nextStep).toBe("Confirm Thursday at 3:00 PM.");
  });
});
