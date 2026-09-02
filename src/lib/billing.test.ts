import { describe, it, expect } from "vitest";
import { effectivePlan, planLimits, canAddTeamSeat, smsEntitled, PLANS } from "./billing";

// A business is never trusted by planTier alone — billingStatus (mirrored from Stripe via
// the webhook) gates whether that tier is actually entitled right now. These tests exist
// specifically because getting this wrong means either charging someone and not granting
// access, or granting paid access to someone who stopped paying.
describe("effectivePlan", () => {
  it("FREE tier is always FREE regardless of billingStatus", () => {
    expect(effectivePlan({ planTier: "FREE", billingStatus: null })).toBe("FREE");
    expect(effectivePlan({ planTier: "FREE", billingStatus: "ACTIVE" })).toBe("FREE");
  });

  it("a paid tier with no billingStatus set falls back to FREE", () => {
    // e.g. planTier was set before a subscription ever actually activated
    expect(effectivePlan({ planTier: "PRO", billingStatus: null })).toBe("FREE");
  });

  for (const status of ["ACTIVE", "TRIALING", "PAST_DUE"] as const) {
    it(`PRO stays entitled while billingStatus is ${status}`, () => {
      expect(effectivePlan({ planTier: "PRO", billingStatus: status })).toBe("PRO");
    });
  }

  for (const status of ["CANCELED", "INCOMPLETE", "INCOMPLETE_EXPIRED", "UNPAID"] as const) {
    it(`a lapsed subscription (${status}) falls back to FREE entitlements`, () => {
      expect(effectivePlan({ planTier: "PRO", billingStatus: status })).toBe("FREE");
      expect(effectivePlan({ planTier: "BUSINESS", billingStatus: status })).toBe("FREE");
    });
  }

  it("BUSINESS stays BUSINESS (not downgraded to PRO) while active", () => {
    expect(effectivePlan({ planTier: "BUSINESS", billingStatus: "ACTIVE" })).toBe("BUSINESS");
  });
});

describe("canAddTeamSeat", () => {
  it("blocks a second seat on Free (limit 1)", () => {
    const free = { planTier: "FREE" as const, billingStatus: null };
    expect(canAddTeamSeat(free, 1)).toBe(false);
    expect(canAddTeamSeat(free, 0)).toBe(true);
  });

  it("allows up to 5 seats on an active Pro plan, blocks the 6th", () => {
    const pro = { planTier: "PRO" as const, billingStatus: "ACTIVE" as const };
    expect(canAddTeamSeat(pro, 4)).toBe(true);
    expect(canAddTeamSeat(pro, 5)).toBe(false);
  });

  it("a canceled Pro subscription is held to Free's seat limit, not Pro's", () => {
    const lapsed = { planTier: "PRO" as const, billingStatus: "CANCELED" as const };
    expect(canAddTeamSeat(lapsed, 1)).toBe(false);
  });

  it("Business has no seat ceiling", () => {
    const business = { planTier: "BUSINESS" as const, billingStatus: "ACTIVE" as const };
    expect(canAddTeamSeat(business, 500)).toBe(true);
  });
});

describe("smsEntitled", () => {
  it("Free never gets SMS", () => {
    expect(smsEntitled({ planTier: "FREE", billingStatus: null })).toBe(false);
  });

  it("Pro gets SMS only while actually entitled", () => {
    expect(smsEntitled({ planTier: "PRO", billingStatus: "ACTIVE" })).toBe(true);
    expect(smsEntitled({ planTier: "PRO", billingStatus: "UNPAID" })).toBe(false);
  });
});

describe("PLANS pricing sanity", () => {
  it("Free is actually free", () => {
    expect(PLANS.FREE.priceCents).toBe(0);
  });

  it("plans are strictly increasing in price", () => {
    expect(PLANS.PRO.priceCents).toBeGreaterThan(PLANS.FREE.priceCents);
    expect(PLANS.BUSINESS.priceCents).toBeGreaterThan(PLANS.PRO.priceCents);
  });

  it("plans are strictly increasing in seat allowance", () => {
    expect(PLANS.PRO.maxTeamSeats).toBeGreaterThan(PLANS.FREE.maxTeamSeats);
    expect(PLANS.BUSINESS.maxTeamSeats).toBeGreaterThan(PLANS.PRO.maxTeamSeats);
  });

  it("planLimits returns the same object as PLANS[key] for a given business", () => {
    expect(planLimits({ planTier: "FREE", billingStatus: null })).toBe(PLANS.FREE);
  });
});
