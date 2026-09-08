import { describe, it, expect } from "vitest";
import { subDays, subHours, addHours } from "date-fns";
import { readOpportunity, senderKind, summarizeMessageByRules, looksLikeTime, type OpportunityInput } from "./opportunity";

const now = new Date("2026-09-08T15:00:00Z");
const person = (over: Partial<OpportunityInput> = {}): OpportunityInput => ({ category: "PRIORITY", relationship: "LEAD", lastWordIsTheirs: true, lastInboundAt: subHours(now, 2), now, ...over });
const lead = (over: Partial<NonNullable<OpportunityInput["lead"]>> = {}): NonNullable<OpportunityInput["lead"]> => ({ status: "NEW", intent: "UNKNOWN", respondedAt: null, lastInboundAt: subHours(now, 2), followUpAt: null, createdAt: subHours(now, 2), ...over });

describe("senderKind", () => {
  it("reads who is on the other end from the classification", () => {
    expect(senderKind("PRIORITY")).toBe("HUMAN");
    for (const c of ["AUTOMATED", "PROMOTIONAL", "SPAM"]) expect(senderKind(c)).toBe("AUTOMATED");
    for (const c of ["VENDOR", "INTERNAL", null, undefined, "??"]) expect(senderKind(c as never)).toBe("UNKNOWN");
  });
});

describe("readOpportunity — who could matter, and why", () => {
  it("a pricing question waiting for a reply is a potential client, ranked high, with the reason in words", () => {
    const o = readOpportunity(person({ lead: lead({ intent: "MEDIUM", serviceName: "Newborn session", budgetCents: 50000, requestedLocation: "Redmond Town Center" }) }));
    expect(o.kind).toBe("potential_client");
    expect(o.label).toBe("Potential client");
    expect(o.reason).toBe("Asked about Newborn session and is waiting for your reply.");
    expect(o.facts).toEqual([{ label: "Service", value: "Newborn session" }, { label: "Where", value: "Redmond Town Center" }, { label: "Budget", value: "$500" }]);
    expect(o.nextAction).toEqual({ kind: "reply", label: "Reply" });
    expect(o.rank).toBeGreaterThan(60);
  });

  it("a DoorDash receipt, a newsletter and junk are never opportunities", () => {
    for (const category of ["AUTOMATED", "PROMOTIONAL", "SPAM"]) {
      const o = readOpportunity(person({ category, lead: lead({ intent: "HIGH", serviceName: "Wedding" }) }));
      expect(o.kind).toBe("automated");
      expect(o.rank).toBe(0);
      expect(o.reason).toBe("");
      expect(o.nextAction).toBeNull();
    }
  });

  it("a platform, a supplier or a teammate is a contact, not a client, whatever they wrote", () => {
    expect(readOpportunity(person({ category: "VENDOR", lead: lead({ intent: "HIGH" }) })).kind).toBe("contact");
    expect(readOpportunity(person({ category: "INTERNAL" })).label).toBe("Your team");
    expect(readOpportunity(person({ category: "VENDOR" })).rank).toBe(0);
  });

  it("a low-value human is still a person, ranked below anyone waiting on the business", () => {
    const quiet = readOpportunity(person({ lastWordIsTheirs: false, lead: lead({ status: "CONTACTED", respondedAt: subHours(now, 1) }) }));
    expect(quiet.kind).toBe("potential_client");
    expect(quiet.reason).toBe("A person writing to you.");
    expect(quiet.rank).toBe(8);
    const waiting = readOpportunity(person({ lead: lead() }));
    expect(waiting.rank).toBeGreaterThan(quiet.rank);
  });

  it("a booking request outranks a question; a client outranks a stranger at the same state", () => {
    const booking = readOpportunity(person({ lead: lead({ intent: "HIGH", serviceName: "Family portraits", requestedDateText: "October" }) }));
    const question = readOpportunity(person({ lead: lead({ intent: "MEDIUM" }) }));
    expect(booking.rank).toBeGreaterThan(question.rank);
    expect(booking.reason).toBe("Asked about Family portraits for October and is waiting for your reply.");
    const client = readOpportunity(person({ relationship: "CUSTOMER", lead: lead({ intent: "MEDIUM" }) }));
    expect(client.label).toBe("Client");
    expect(client.rank).toBeGreaterThan(question.rank);
  });

  it("a follow-up that is due says so, and an unconfirmed booking asks for confirmation first", () => {
    const due = readOpportunity(person({ lastWordIsTheirs: false, lead: lead({ status: "CONTACTED", lastInboundAt: subDays(now, 5), respondedAt: subDays(now, 4), followUpAt: subHours(now, 1) }) }));
    expect(due.reason).toBe("Follow-up due today.");
    expect(due.nextAction?.kind).toBe("follow_up");
    const unconfirmed = readOpportunity(person({ relationship: "CUSTOMER", hasUpcomingBooking: true, upcomingUnconfirmed: true, lead: lead({ status: "BOOKED" }) }));
    expect(unconfirmed.reason).toBe("Booking on the calendar that isn't confirmed yet.");
    expect(unconfirmed.nextAction).toEqual({ kind: "confirm", label: "Confirm booking" });
    expect(unconfirmed.kind).toBe("client");
  });

  it("silence after the business's reply becomes a nudge with the ask attached", () => {
    const o = readOpportunity(person({ lastWordIsTheirs: false, lead: lead({ status: "CONTACTED", serviceName: "Portrait session", lastInboundAt: subDays(now, 6), respondedAt: subDays(now, 4) }) }));
    expect(o.reason).toBe("Asked about Portrait session; your reply went unanswered.");
    expect(o.attention?.kind).toBe("follow_up_suggested");
  });

  it("never invents a fact: no lead means no facts and a plain reason", () => {
    const o = readOpportunity(person({ lead: null }));
    expect(o.facts).toEqual([]);
    expect(o.reason).toBe("A person writing to you.");
    expect(o.nextAction?.kind).toBe("view");
  });

  it("an archived thread is out of Priority", () => {
    expect(readOpportunity(person({ archived: true, lead: lead({ intent: "HIGH" }) })).rank).toBe(0);
  });
});

describe("summarizeMessageByRules", () => {
  it("leads with the message's own first sentences and lists only what the rules read", () => {
    const s = summarizeMessageByRules("Hey! We're looking for family portraits sometime in October. We'd love to do them at Marymoor Park around sunset. Our budget is around $500. Are you available?", { serviceHint: "family", dateText: "October", location: "Marymoor Park", budgetCents: 50000, intent: "MEDIUM" });
    expect(s.startsWith("Hey! We're looking for family portraits sometime in October.")).toBe(true);
    expect(s).toContain("Mentions: family, October, Marymoor Park, budget $500.");
    expect(s.endsWith("Asking about pricing or availability.")).toBe(true);
  });
  it("says so when there is nothing to act on, and caps a long opener", () => {
    expect(summarizeMessageByRules("   ", { serviceHint: null, dateText: null, location: null, budgetCents: null, intent: "UNKNOWN" })).toBe("Nothing important to act on.");
    const long = summarizeMessageByRules("word ".repeat(120) + ". next", { serviceHint: null, dateText: null, location: null, budgetCents: null, intent: "UNKNOWN" });
    expect(long.length).toBeLessThan(240);
    expect(long).toContain("…");
  });
});

describe("a date is never shown as a place", () => {
  it("looksLikeTime recognizes months, days, relative words and clock times", () => {
    for (const t of ["September", "sept", "Monday", "next week", "noon", "3 pm", "10/12", "this weekend", "Tomorrow"]) expect(looksLikeTime(t)).toBe(true);
    for (const t of ["Marymoor Park", "Redmond Town Center", "Kirkland", "Sunset Beach"]) expect(looksLikeTime(t)).toBe(false);
  });
  it("readOpportunity drops a location that is really a month; the rules summary does too", () => {
    const o = readOpportunity(person({ lead: lead({ requestedLocation: "September", budgetCents: 80000 }) }));
    expect(o.facts.map((f) => f.label)).toEqual(["Budget"]);
    expect(summarizeMessageByRules("Following up on pricing for a September date.", { serviceHint: null, dateText: "September", location: "September", budgetCents: 80000, intent: "MEDIUM" })).not.toMatch(/Mentions: September, September/);
  });
});

