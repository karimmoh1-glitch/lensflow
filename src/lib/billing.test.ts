import { describe, it, expect } from "vitest";
import { effectivePlan, planLimits, canAddTeamSeat, canConnectIntegration, canEnableAutomation, businessAgentEntitled, planForIntegrations, smsEntitled, automationsEntitled, aiEntitled, limitLabel, PLANS } from "./billing";

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

  it("Pro is one person: the owner's seat only, no second", () => {
    const pro = { planTier: "PRO" as const, billingStatus: "ACTIVE" as const };
    expect(canAddTeamSeat(pro, 0)).toBe(true);
    expect(canAddTeamSeat(pro, 1)).toBe(false);
  });

  it("a canceled Pro subscription is held to Free's seat limit, not Pro's", () => {
    const lapsed = { planTier: "PRO" as const, billingStatus: "CANCELED" as const };
    expect(canAddTeamSeat(lapsed, 1)).toBe(false);
  });

  it("Business seats up to 10 people, then refuses", () => {
    const business = { planTier: "BUSINESS" as const, billingStatus: "ACTIVE" as const };
    expect(canAddTeamSeat(business, 9)).toBe(true);
    expect(canAddTeamSeat(business, 10)).toBe(false);
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

// These two guard the entitlement checks actually wired into toggleAutomation
// (src/app/actions/automations.ts) and generateDraftAction (src/app/actions/inbox.ts) —
// a regression here silently turns a paid feature free for every business on Free.
describe("automations", () => {
  const free = { planTier: "FREE" as const, billingStatus: null };
  it("Free gets 3 automations, not a 4th", () => {
    expect(automationsEntitled(free)).toBe(true);
    expect(canEnableAutomation(free, 0)).toBe(true);
    expect(canEnableAutomation(free, 2)).toBe(true);
    expect(canEnableAutomation(free, 3)).toBe(false);
  });

  it("Pro and Business are unlimited while actually entitled", () => {
    expect(canEnableAutomation({ planTier: "PRO", billingStatus: "ACTIVE" }, 500)).toBe(true);
    expect(canEnableAutomation({ planTier: "BUSINESS", billingStatus: "TRIALING" }, 500)).toBe(true);
  });

  it("a lapsed Pro subscription is held to Free's cap", () => {
    expect(canEnableAutomation({ planTier: "PRO", billingStatus: "CANCELED" }, 3)).toBe(false);
  });
});

describe("connected integrations", () => {
  const free = { planTier: "FREE" as const, billingStatus: null };
  const pro = { planTier: "PRO" as const, billingStatus: "ACTIVE" as const };
  const business = { planTier: "BUSINESS" as const, billingStatus: "ACTIVE" as const };
  it("Free: 0, 1 and 2 may connect; the third is refused", () => {
    expect(canConnectIntegration(free, 0)).toBe(true);
    expect(canConnectIntegration(free, 1)).toBe(true);
    expect(canConnectIntegration(free, 2)).toBe(false);
  });
  it("Pro: every channel and calendar, no ceiling", () => {
    for (let n = 0; n < 8; n++) expect(canConnectIntegration(pro, n)).toBe(true);
  });
  it("Business: unlimited", () => {
    expect(canConnectIntegration(business, 60)).toBe(true);
  });
  it("a Business tier whose subscription lapsed is held to Free's 2", () => {
    expect(canConnectIntegration({ planTier: "BUSINESS", billingStatus: "CANCELED" }, 2)).toBe(false);
  });
  it("names the smallest plan that fits a count", () => {
    expect(planForIntegrations(2)).toBe("FREE");
    expect(planForIntegrations(3)).toBe("PRO");
    expect(planForIntegrations(7)).toBe("PRO");
    expect(limitLabel(PLANS.PRO.maxIntegrations)).toBe("Unlimited");
    expect(limitLabel(PLANS.BUSINESS.maxIntegrations)).toBe("Unlimited");
  });
});

describe("businessAgentEntitled", () => {
  it("Free denied, Pro and Business allowed", () => {
    expect(businessAgentEntitled({ planTier: "FREE", billingStatus: null })).toBe(false);
    expect(businessAgentEntitled({ planTier: "PRO", billingStatus: "ACTIVE" })).toBe(true);
    expect(businessAgentEntitled({ planTier: "BUSINESS", billingStatus: "ACTIVE" })).toBe(true);
  });
  it("Business gets a higher approved-send cap than Pro", () => {
    expect(PLANS.BUSINESS.agentHourlyLimit).toBeGreaterThan(PLANS.PRO.agentHourlyLimit);
    expect(PLANS.FREE.agentHourlyLimit).toBe(0);
  });
  it("a lapsed Business subscription is denied", () => {
    expect(businessAgentEntitled({ planTier: "BUSINESS", billingStatus: "UNPAID" })).toBe(false);
  });
});

describe("aiEntitled", () => {
  it("Free never gets AI-drafted replies", () => {
    expect(aiEntitled({ planTier: "FREE", billingStatus: null })).toBe(false);
  });

  it("Pro and Business get AI while actually entitled", () => {
    expect(aiEntitled({ planTier: "PRO", billingStatus: "ACTIVE" })).toBe(true);
    expect(aiEntitled({ planTier: "BUSINESS", billingStatus: "ACTIVE" })).toBe(true);
  });

  it("a lapsed subscription loses AI entitlement", () => {
    expect(aiEntitled({ planTier: "PRO", billingStatus: "UNPAID" })).toBe(false);
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

  it("only Business is a team plan", () => {
    expect(PLANS.FREE.teamEnabled).toBe(false);
    expect(PLANS.PRO.teamEnabled).toBe(false);
    expect(PLANS.BUSINESS.teamEnabled).toBe(true);
    expect(PLANS.BUSINESS.maxTeamSeats).toBeGreaterThan(PLANS.PRO.maxTeamSeats);
  });
  it("prices are what the site says: Free $0, Pro $20, Business $50", () => {
    expect(PLANS.PRO.priceCents).toBe(2000);
    expect(PLANS.BUSINESS.priceCents).toBe(5000);
  });

  it("planLimits returns the same object as PLANS[key] for a given business", () => {
    expect(planLimits({ planTier: "FREE", billingStatus: null })).toBe(PLANS.FREE);
  });
});
