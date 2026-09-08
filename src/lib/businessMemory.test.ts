import { describe, it, expect } from "vitest";
import { readBusinessMemory, memoryPromptLines, hasMemory, businessMemorySchema } from "./businessMemory";
import { draftTurns } from "./ai";
import { isDraftMode, DRAFT_MODES } from "./draftModes";
import { looksLikeQuote, shouldScheduleQuoteFollowUp, quoteFollowUpAt } from "./quoteFollowUp";

describe("business memory", () => {
  it("reads what the owner wrote and nothing else; malformed storage reads as empty", () => {
    expect(readBusinessMemory(null)).toMatchObject({ tone: "warm", about: "" });
    expect(readBusinessMemory({ tone: "casual", about: "Wedding and family photography in Seattle", faqs: "Do you travel? Yes, within 50 miles." }).tone).toBe("casual");
    expect(readBusinessMemory({ tone: "shouty" })).toMatchObject({ tone: "warm" });
    expect(hasMemory(readBusinessMemory(null))).toBe(false);
    expect(businessMemorySchema.safeParse({ about: "x".repeat(601) }).success).toBe(false);
  });
  it("the prompt lines are labelled as the owner's, and only filled fields appear", () => {
    const lines = memoryPromptLines(readBusinessMemory({ about: "Newborn and family sessions.", policies: "48-hour reschedule notice." }));
    expect(lines).toEqual(["About the business (owner's words): Newborn and family sessions.", "Policies: 48-hour reschedule notice."]);
  });
});

describe("draft modes ground the same prompt", () => {
  const base = { businessName: "Alex Rivera Photography", services: [{ name: "Newborn session", priceCents: 35000, durationMins: 90 }], customerMessage: "How much for a newborn session in October?", customerName: "Sarah" };
  it("every mode is accepted and adds its own instruction; an unknown mode falls back to a plain reply", () => {
    for (const [key] of DRAFT_MODES) expect(isDraftMode(key)).toBe(true);
    expect(isDraftMode("sell_hard")).toBe(false);
    const follow = draftTurns({ ...base, mode: "follow_up" }).system;
    expect(follow).toMatch(/follow-up on a conversation that went quiet/);
    const pricing = draftTurns({ ...base, mode: "send_pricing" }).system;
    expect(pricing).toMatch(/Never invent a price/);
    expect(pricing).toContain("Newborn session: $350 (90 min)");
    expect(draftTurns({ ...base, mode: "bogus" as never }).system).toMatch(/Answer what the person actually asked/);
  });
  it("the owner's notes and tone reach the prompt, labelled as the only facts the model knows", () => {
    const t = draftTurns({ ...base, tone: "casual", memoryLines: ["Areas served: Seattle and the Eastside", "Policies: 50% deposit holds the date"] }).system;
    expect(t).toMatch(/^You are drafting a short, casual, friendly reply/);
    expect(t).toContain("Owner's notes (facts you may rely on):\nAreas served: Seattle and the Eastside\nPolicies: 50% deposit holds the date");
    expect(t).toMatch(/only facts you know about the business are the services list and the owner's notes/);
    expect(t).toMatch(/never invent it/);
  });
});

describe("a quote that goes out gets a follow-up", () => {
  it("recognizes a price in a reply, and only schedules for an open lead with no follow-up planned", () => {
    expect(looksLikeQuote("A newborn session is $350 and runs about 90 minutes.")).toBe(true);
    expect(looksLikeQuote("Our package rates start at $1,200 for weddings.")).toBe(true);
    expect(looksLikeQuote("Thanks! What date were you thinking?")).toBe(false);
    const open = { status: "CONTACTED", followUpAt: null };
    expect(shouldScheduleQuoteFollowUp({ body: "It's $350.", lead: open })).toBe(true);
    expect(shouldScheduleQuoteFollowUp({ body: "It's $350.", lead: null })).toBe(false);
    expect(shouldScheduleQuoteFollowUp({ body: "It's $350.", lead: { status: "BOOKED", followUpAt: null } })).toBe(false);
    expect(shouldScheduleQuoteFollowUp({ body: "It's $350.", lead: { status: "CONTACTED", followUpAt: new Date(Date.now() + 86400000) } })).toBe(false);
    expect(shouldScheduleQuoteFollowUp({ body: "What date?", lead: open })).toBe(false);
  });
  it("lands three days out at nine in the morning", () => {
    const at = quoteFollowUpAt(new Date("2026-09-08T22:15:00"));
    expect(at.getHours()).toBe(9);
    expect(at.getDate()).toBe(11);
  });
});
