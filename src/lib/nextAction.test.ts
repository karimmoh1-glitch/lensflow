import { describe, it, expect } from "vitest";
import { readValue, rankNextActions, moneyAtRisk, moneyAtRiskSentence, isAtRisk, stageFor, headlineFor, type NextAction } from "./nextAction";
import { parseQuoteCents } from "./quoteFollowUp";

const now = new Date("2026-09-08T12:00:00Z");
const row = (over: Partial<NextAction> & Pick<NextAction, "id" | "rule" | "since">): NextAction => ({
  kind: over.rule === "waiting_reply" ? "reply" : over.rule === "confirm_booking" ? "confirm_booking" : "follow_up",
  person: { name: "A", clientId: null, conversationId: null, leadId: null, bookingId: null },
  headline: "", why: "", stage: "", detail: null, value: null, atRisk: false, href: "/", draftMode: null, channel: null, serviceName: null, requestedDateText: null, booking: null,
  ...over,
});

describe("value: known money before estimates", () => {
  it("a quote that went out beats a budget beats a list price, and only the list price is an estimate", () => {
    expect(readValue({ quotedCents: 50000, budgetCents: 80000, servicePriceCents: 35000 })).toMatchObject({ cents: 50000, basis: "quoted", known: true, label: "Quoted $500" });
    expect(readValue({ budgetCents: 80000, servicePriceCents: 35000 })).toMatchObject({ cents: 80000, basis: "budget", known: true });
    expect(readValue({ servicePriceCents: 35000 })).toMatchObject({ cents: 35000, basis: "service", known: false, label: "About $350, the service's price" });
    expect(readValue({ estimatedValueCents: 12000 })).toMatchObject({ basis: "service", known: false });
    expect(readValue({})).toBeNull();
  });
  it("reads the price the business actually sent", () => {
    expect(parseQuoteCents("A newborn session is $350 for 90 minutes.")).toBe(35000);
    expect(parseQuoteCents("Packages start at $1,200.50 and go up.")).toBe(120050);
    expect(parseQuoteCents("Happy to help — when works for you?")).toBeNull();
    expect(parseQuoteCents("$0 down")).toBeNull();
  });
});

describe("next best action: order, risk, wording", () => {
  it("replies first (longest wait), then bookings to confirm, then follow-ups by money then quiet", () => {
    const rows = [
      row({ id: "f1", rule: "follow_up_suggested", since: new Date("2026-09-04"), value: { cents: 35000, basis: "service", known: false, label: "" } }),
      row({ id: "f2", rule: "follow_up_suggested", since: new Date("2026-09-01"), value: { cents: 50000, basis: "quoted", known: true, label: "" } }),
      row({ id: "b1", rule: "confirm_booking", since: new Date("2026-09-10") }),
      row({ id: "r2", rule: "waiting_reply", since: new Date("2026-09-08T09:00:00Z") }),
      row({ id: "r1", rule: "waiting_reply", since: new Date("2026-09-06") }),
      row({ id: "d1", rule: "follow_up_due", since: new Date("2026-09-07") }),
    ];
    expect(rankNextActions(rows).map((r) => r.id)).toEqual(["r1", "r2", "b1", "d1", "f2", "f1"]);
  });
  it("silence after a reply is at risk; an inquiry is at risk after two days unanswered, not before", () => {
    expect(isAtRisk({ rule: "follow_up_suggested", since: new Date("2026-09-04"), now })).toBe(true);
    expect(isAtRisk({ rule: "waiting_reply", since: new Date("2026-09-08T09:00:00Z"), now })).toBe(false);
    expect(isAtRisk({ rule: "waiting_reply", since: new Date("2026-09-05"), now })).toBe(true);
    expect(isAtRisk({ rule: "confirm_booking", since: new Date("2026-09-01"), now })).toBe(false);
  });
  it("money at risk keeps known money and estimates apart and never invents a figure", () => {
    const rows = [
      row({ id: "a", rule: "follow_up_suggested", since: now, atRisk: true, value: { cents: 50000, basis: "quoted", known: true, label: "" } }),
      row({ id: "b", rule: "follow_up_suggested", since: now, atRisk: true, value: { cents: 35000, basis: "service", known: false, label: "" } }),
      row({ id: "c", rule: "follow_up_due", since: now, atRisk: true, value: null }),
      row({ id: "d", rule: "waiting_reply", since: now, atRisk: false, value: { cents: 99900, basis: "quoted", known: true, label: "" } }),
    ];
    const m = moneyAtRisk(rows);
    expect(m).toEqual({ knownCents: 50000, estimatedCents: 35000, people: 3 });
    expect(moneyAtRiskSentence(m)).toBe("$500 quoted or budgeted and about $350 in service prices may be going cold across 3 people.");
    expect(moneyAtRiskSentence({ knownCents: 0, estimatedCents: 0, people: 2 })).toBeNull();
  });
  it("speaks in a person's terms, never a score", () => {
    expect(headlineFor("reply", "Sarah")).toBe("Sarah needs your reply");
    expect(headlineFor("follow_up", "Sarah")).toBe("Sarah may be going cold");
    expect(stageFor({ rule: "waiting_reply", leadStatus: "NEW", quoted: false })).toBe("New inquiry");
    expect(stageFor({ rule: "follow_up_suggested", leadStatus: "CONTACTED", quoted: true })).toBe("Quote sent, no answer");
    expect(stageFor({ rule: "confirm_booking", leadStatus: null, quoted: false })).toBe("Booked, not confirmed");
  });
});
