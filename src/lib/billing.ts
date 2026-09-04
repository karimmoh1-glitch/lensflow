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
    automationsEnabled: boolean;
    aiEnabled: boolean; // AI summaries, reply drafts, lead scoring
    intelligenceEnabled: boolean; // the executive view: what's at risk, what's converting, response time
    tagline: string;
    outcome: string; // what the tier is for, in one line
    features: string[];
  }
> = {
  FREE: {
    key: "FREE",
    name: "Free",
    priceCents: 0,
    maxTeamSeats: 1,
    smsEnabled: false,
    automationsEnabled: false,
    aiEnabled: false,
    intelligenceEnabled: false,
    tagline: "Get your business onto one thread.",
    outcome: "Every conversation, booking and payment in one place — with automated mail kept out of your way.",
    features: [
      "Priority inbox — automated, promotional and vendor mail kept out of your way",
      "Unlimited clients, bookings and conversations",
      "Email + booking page inbox",
      "Booking page with deposits",
      "Zelle / bank transfer payment tracking",
      "1 seat",
    ],
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    priceCents: 2000,
    maxTeamSeats: 5,
    smsEnabled: true,
    automationsEnabled: true,
    aiEnabled: true,
    intelligenceEnabled: false,
    tagline: "Know what deserves your attention.",
    outcome: "For people who are serious about running their business without living inside their inbox.",
    features: [
      "Everything in Free",
      "Automations that actually run — confirmations, reminders, follow-ups, thank-yous",
      "AI summaries and reply drafts, grounded in your services and prices",
      "SMS inbox on your own number",
      "Client intelligence — where every relationship stands and what to do next",
      "Up to 5 seats",
    ],
  },
  BUSINESS: {
    key: "BUSINESS",
    name: "Business",
    priceCents: 8000,
    maxTeamSeats: Infinity,
    smsEnabled: true,
    automationsEnabled: true,
    aiEnabled: true,
    intelligenceEnabled: true,
    tagline: "Run the business from one intelligent operating system.",
    outcome: "For operators with a team, real volume, and no time to inspect everything by hand.",
    features: [
      "Everything in Pro",
      "Executive view — what's at risk, what's converting, how fast you respond, revenue sitting in conversations",
      "Unlimited seats, roles, partner assignment and shared inbox access",
      "Business memory — what each customer is worth, who's going cold, who's due a follow-up",
      "Priority support",
    ],
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

export function automationsEntitled(business: BillingFields): boolean {
  return planLimits(business).automationsEnabled;
}

export function aiEntitled(business: BillingFields): boolean {
  return planLimits(business).aiEnabled;
}

export function intelligenceEntitled(business: BillingFields): boolean {
  return planLimits(business).intelligenceEnabled;
}
