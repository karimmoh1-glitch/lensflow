import type { Business } from "@prisma/client";

/**
 * Daythread's own subscription plans — what a business pays US, separate from
 * MembershipPlan/Subscription (a photographer's own client paying THEM). This is the
 * single source of truth for pricing and entitlements: everything else in the app asks
 * `effectivePlan(business)` / `canAddTeamSeat(...)` / `smsEntitled(...)` rather than
 * re-deriving plan logic at each call site.
 */
export type PlanKey = "FREE" | "PRO" | "BUSINESS";

export const PLANS: Record<
  PlanKey,
  {
    key: PlanKey;
    name: string;
    priceCents: number; // per month; 0 for Free
    maxTeamSeats: number; // Infinity = unlimited
    smsEnabled: boolean;
    tagline: string;
    features: string[];
  }
> = {
  FREE: {
    key: "FREE",
    name: "Free",
    priceCents: 0,
    maxTeamSeats: 1,
    smsEnabled: false,
    tagline: "Everything a solo freelancer needs to get organized.",
    features: [
      "Unlimited clients & bookings",
      "Unified email + website inbox",
      "Booking pages & deposit collection",
      "Zelle / bank transfer payment tracking",
      "1 team seat",
    ],
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    priceCents: 2900,
    maxTeamSeats: 5,
    smsEnabled: true,
    tagline: "For a growing business juggling more clients and a small team.",
    features: [
      "Everything in Free",
      "AI-powered lead scoring & reply drafts",
      "SMS inbox on your own number",
      "Up to 5 team seats",
      "Automations",
    ],
  },
  BUSINESS: {
    key: "BUSINESS",
    name: "Business",
    priceCents: 7900,
    maxTeamSeats: Infinity,
    smsEnabled: true,
    tagline: "For studios with a full team and higher booking volume.",
    features: ["Everything in Pro", "Unlimited team seats", "Priority support"],
  },
};

export const PAID_PLAN_KEYS: PlanKey[] = ["PRO", "BUSINESS"];

// Stripe's own dunning (Smart Retries) owns the PAST_DUE -> CANCELED/UNPAID transition;
// we don't reimplement that timing here. Keeping access through PAST_DUE is the graceful-
// failure behavior the business objective calls for — a single failed card shouldn't
// instantly lock someone out of their own client data.
const ENTITLED_STATUSES = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

type BillingFields = Pick<Business, "planTier" | "billingStatus">;

/** The plan a business actually has access to right now — never trust planTier alone;
 * a lapsed/canceled paid subscription always falls back to Free entitlements. */
export function effectivePlan(business: BillingFields): PlanKey {
  if (business.planTier === "FREE") return "FREE";
  if (business.billingStatus && ENTITLED_STATUSES.has(business.billingStatus)) {
    return business.planTier as PlanKey;
  }
  return "FREE";
}

export function planLimits(business: BillingFields) {
  return PLANS[effectivePlan(business)];
}

export function canAddTeamSeat(business: BillingFields, currentSeatCount: number): boolean {
  return currentSeatCount < planLimits(business).maxTeamSeats;
}

export function smsEntitled(business: BillingFields): boolean {
  return planLimits(business).smsEnabled;
}
