import { describe, it, expect } from "vitest";
import { AI_INPUT_CHAR_LIMIT, AI_MODEL, AI_RATE_LIMITS, DAILY_CALL_CEILING, MAX_TOKENS, PRICING, estimateCostMicros, formatCostMicros, truncateForModel } from "./aiPolicy";

describe("truncateForModel", () => {
  it("leaves anything within the cap untouched", () => {
    expect(truncateForModel("short message")).toBe("short message");
    const exact = "x".repeat(AI_INPUT_CHAR_LIMIT);
    expect(truncateForModel(exact)).toBe(exact);
  });

  it("cuts to exactly the cap and is deterministic", () => {
    const long = "a".repeat(20_000);
    const once = truncateForModel(long);
    expect(once).toHaveLength(AI_INPUT_CHAR_LIMIT);
    expect(truncateForModel(long)).toBe(once);
  });

  it("keeps the opening and the closing, and marks the gap", () => {
    const body = `Hi, I'd like a wedding shoot.${"filler ".repeat(3000)}My budget is $2000 on June 14.`;
    const cut = truncateForModel(body);
    expect(cut).toHaveLength(AI_INPUT_CHAR_LIMIT);
    expect(cut.startsWith("Hi, I'd like a wedding shoot.")).toBe(true);
    expect(cut.endsWith("My budget is $2000 on June 14.")).toBe(true);
    expect(cut).toContain("[…]");
  });

  it("honours a custom cap and degrades safely at tiny ones", () => {
    expect(truncateForModel("a".repeat(500), 100)).toHaveLength(100);
    expect(truncateForModel("abcdefghij", 4)).toBe("abcd");
    expect(truncateForModel("", 10)).toBe("");
  });
});

describe("cost", () => {
  it("prices gpt-4o-mini from the published list", () => {
    // 1,000,000 input tokens at $0.15 and 1,000,000 output at $0.60.
    expect(estimateCostMicros(AI_MODEL, 1_000_000, 0)).toBe(150_000);
    expect(estimateCostMicros(AI_MODEL, 0, 1_000_000)).toBe(600_000);
    expect(estimateCostMicros(AI_MODEL, 1_000, 200)).toBe(270);
    expect(estimateCostMicros(AI_MODEL, 0, 0)).toBe(0);
  });

  it("returns zero for a model that is not priced rather than guessing", () => {
    expect(estimateCostMicros("some-future-model", 1_000_000, 1_000_000)).toBe(0);
    expect(PRICING[AI_MODEL]).toBeDefined();
  });

  it("formats small amounts so one call is still visible", () => {
    expect(formatCostMicros(0)).toBe("$0");
    expect(formatCostMicros(270)).toBe("$0.0003");
    expect(formatCostMicros(50_000)).toBe("$0.050");
    expect(formatCostMicros(2_500_000)).toBe("$2.50");
  });
});

describe("policy table", () => {
  it("caps output on every feature", () => {
    expect(MAX_TOKENS).toEqual({ extraction: 200, draft: 300, agent_draft: 300, assistant: 500, summary: 100, summary_forced: 100 });
    for (const value of Object.values(MAX_TOKENS)) expect(value).toBeGreaterThan(0);
  });

  it("limits the paths the audit found unbounded, and backstops the rest", () => {
    expect(AI_RATE_LIMITS.draft).toEqual({ limit: 60, windowMs: 3_600_000 });
    expect(AI_RATE_LIMITS.agent_draft).toEqual({ limit: 30, windowMs: 3_600_000 });
    expect(AI_RATE_LIMITS.summary_forced).toEqual({ limit: 30, windowMs: 3_600_000 });
    expect(AI_RATE_LIMITS.extraction).toEqual({ limit: 200, windowMs: 86_400_000 });
    expect(DAILY_CALL_CEILING).toEqual({ limit: 500, windowMs: 86_400_000 });
    // A cached summary never reaches the model, so the uncached one rides the daily backstop.
    expect(AI_RATE_LIMITS.summary).toBeUndefined();
  });
});
