import { describe, it, expect } from "vitest";
import { effectivePlan, planLimits, canAddTeamSeat, canConnectIntegration, teamEntitled, aiEntitled, smsEntitled, planForIntegrations, PLANS, VISIBLE_PLANS } from "./billing";

describe("effectivePlan", () => {
  it("FREE is FREE regardless of billing status", () => {
    expect(effectivePlan({ planTier: "FREE", billingStatus: null })).toBe("FREE");
    expect(effectivePlan({ planTier: "FREE", billingStatus: "ACTIVE" })).toBe("FREE");
  });
  it("a paid tier with no billing status falls back to FREE", () => {
    expect(effectivePlan({ planTier: "PRO", billingStatus: null })).toBe("FREE");
  });
  for (const status of ["ACTIVE", "TRIALING", "PAST_DUE"] as const) {
    it(`PRO stays entitled while ${status}`, () => {
      expect(effectivePlan({ planTier: "PRO", billingStatus: status })).toBe("PRO");
    });
  }
  for (const status of ["CANCELED", "INCOMPLETE", "INCOMPLETE_EXPIRED", "UNPAID"] as const) {
    it(`a lapsed subscription (${status}) is Free`, () => {
      expect(effectivePlan({ planTier: "PRO", billingStatus: status })).toBe("FREE");
      expect(effectivePlan({ planTier: "BUSINESS", billingStatus: status })).toBe("FREE");
    });
  }
  it("a legacy BUSINESS subscription is treated as Pro and never shown", () => {
    expect(planLimits({ planTier: "BUSINESS", billingStatus: "ACTIVE" }).teamEnabled).toBe(true);
    expect(PLANS.BUSINESS.hidden).toBe(true);
    expect(VISIBLE_PLANS).toEqual(["FREE", "PRO"]);
  });
});

describe("limits", () => {
  const free = { planTier: "FREE" as const, billingStatus: null };
  const pro = { planTier: "PRO" as const, billingStatus: "ACTIVE" as const };
  it("Free: two channels, one seat, no team or AI", () => {
    expect(canConnectIntegration(free, 1)).toBe(true);
    expect(canConnectIntegration(free, 2)).toBe(false);
    expect(canAddTeamSeat(free, 1)).toBe(false);
    expect(teamEntitled(free)).toBe(false);
    expect(aiEntitled(free)).toBe(false);
    expect(smsEntitled(free)).toBe(false);
  });
  it("Pro: every channel, five seats, team and AI", () => {
    expect(canConnectIntegration(pro, 40)).toBe(true);
    expect(canAddTeamSeat(pro, 4)).toBe(true);
    expect(canAddTeamSeat(pro, 5)).toBe(false);
    expect(teamEntitled(pro)).toBe(true);
    expect(aiEntitled(pro)).toBe(true);
    expect(smsEntitled(pro)).toBe(true);
  });
  it("a lapsed Pro is held to Free", () => {
    expect(canConnectIntegration({ planTier: "PRO", billingStatus: "CANCELED" }, 2)).toBe(false);
  });
  it("names the plan that fits a channel count", () => {
    expect(planForIntegrations(2)).toBe("FREE");
    expect(planForIntegrations(3)).toBe("PRO");
  });
  it("Pro costs $20", () => {
    expect(PLANS.PRO.priceCents).toBe(2000);
    expect(PLANS.FREE.priceCents).toBe(0);
  });
});
