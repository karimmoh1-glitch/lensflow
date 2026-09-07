import { describe, it, expect } from "vitest";
import { summarizeDeterministically, readMessage } from "./summarize";

describe("summarizeDeterministically", () => {
  it("turns a messy inquiry into a sentence, details, status and next step", () => {
    const s = summarizeDeterministically({
      personName: "Ahmed Mantawy",
      channel: "EMAIL",
      messages: [
        { direction: "INBOUND", body: "Hi, are you available for a session in September?", createdAt: new Date("2026-08-29") },
        { direction: "OUTBOUND", body: "Where were you thinking, and what's your budget?", createdAt: new Date("2026-08-30") },
        { direction: "INBOUND", body: "I'd like to book. The location will be at Redmond Town Center. My budget is $500, and I want this done for my newborn child.\n\nOn Sun, Aug 30, 2026 at 4:35 PM Alex wrote:\n> Where were you thinking?", createdAt: new Date("2026-08-31") },
      ],
      mentioned: { serviceName: "Newborn session", requestedLocation: "Redmond Town Center", budgetCents: 50000 },
    });
    expect(s.summary).toBe("Ahmed is asking for newborn session at Redmond Town Center.");
    expect(s.details).toEqual(expect.arrayContaining([{ label: "Location", value: "Redmond Town Center" }, { label: "Amount", value: "$500" }, { label: "About", value: "Newborn session" }]));
    expect(s.status).toBe("Waiting on you");
    expect(s.nextStep).toBe("Reply to their question.");
    expect(s.source).toBe("rules");
  });

  it("reads a confirmation with its day and time from the words alone", () => {
    const s = summarizeDeterministically({ personName: "Sarah Kim", channel: "SMS", messages: [{ direction: "INBOUND", body: "Thursday works! Can we do 3pm?", createdAt: new Date() }] });
    expect(s.summary).toBe("Sarah is confirming Thursday at 3:00 PM.");
    expect(s.mentioned).toMatchObject({ intent: "CONFIRM", day: "Thursday", time: "3:00 PM", confidence: "high" });
    expect(s.nextStep).toBe("Reply to confirm.");
  });

  it("knows when the last word was yours", () => {
    const s = summarizeDeterministically({ personName: "Jo", channel: "INSTAGRAM", messages: [{ direction: "INBOUND", body: "How much for a half day?", createdAt: new Date("2026-09-01") }, { direction: "OUTBOUND", body: "It's $400.", createdAt: new Date("2026-09-02") }] });
    expect(s.status).toBe("Waiting on them");
    expect(s.summary).toBe("Jo is asking about pricing.");
    expect(s.nextStep).toMatch(/^Nothing needed right now/);
  });

  it("readMessage never invents: a plain update has low confidence and no date", () => {
    expect(readMessage("Got it, thanks for the update.")).toMatchObject({ intent: "THANKS", day: null, time: null, amountCents: null });
    expect(readMessage("Sending the files tonight around 9pm")).toMatchObject({ intent: "UPDATE", day: "Tonight", time: "9:00 PM", confidence: "low" });
  });
});
