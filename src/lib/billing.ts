import type { Business } from "@prisma/client";

/**
 * Daythread's own subscription plans — what a business pays US, separate from
 * MembershipPlan/Subscription (a photographer's own client paying THEM). This is the
 * single source of truth for pricing and entitlements: everything else in the app asks
 * `effectivePlan(business)` / `planLimits(business)` / the `*Entitled(...)` helpers rather
 * than re-deriving plan logic at each call site.
 *
 * Numbers here are enforced server-side at the point each resource is created or activated
 * (see src/server/integrationQuota.ts, src/app/actions/automations.ts, invitations.ts and
 * agent.ts). The UI only reflects them.
 */
export type PlanKey = "FREE" | "PRO" | "BUSINESS";

export const PLANS: Record<
  PlanKey,
  {
    key: PlanKey;
    name: string;
    priceCents: number; // per month; 0 for Free
    /** Connected integrations (Gmail, Instagram, WhatsApp, SMS, Google Calendar, Apple Calendar). Infinity = unlimited. */
    maxIntegrations: number;
    /** Automations that may be switched on at once. Infinity = unlimited. */
    maxAutomations: number;
    maxTeamSeats: number; // Infinity = unlimited
    smsEnabled: boolean;
    /** AI summaries, reply drafts, lead scoring. Free gets the limited copilot only. */
    aiEnabled: boolean;
    /** Copilot questions per day. Infinity = unlimited (the hourly abuse cap still applies). */
    copilotDailyLimit: number;
    intelligenceEnabled: boolean; // the executive view: what's at risk, what's converting, response time
    /** The Daythread Business Agent — Business only. */
    businessAgentEnabled: boolean;
    tagline: string;
    outcome: string; // what the tier is for, in one line
    features: string[];
  }
> = {
  FREE: {
    key: "FREE",
    name: "Free",
    priceCents: 0,
    maxIntegrations: 2,
    maxAutomations: 3,
    maxTeamSeats: 1,
    smsEnabled: false,
    aiEnabled: false,
    copilotDailyLimit: 5,
    intelligenceEnabled: false,
    businessAgentEnabled: false,
    tagline: "Get your business onto one thread.",
    outcome: "Every conversation, booking and payment in one place — with automated mail kept out of your way.",
    features: [
      "2 connected integrations",
      "3 automations",
      "1 team member",
      "Limited AI — 5 Copilot questions a day",
      "Basic unified inbox with priority sorting",
      "Booking page with deposits",
    ],
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    priceCents: 2000,
    maxIntegrations: 6,
    maxAutomations: Infinity,
    maxTeamSeats: 3,
    smsEnabled: true,
    aiEnabled: true,
    copilotDailyLimit: Infinity,
    intelligenceEnabled: false,
    businessAgentEnabled: false,
    tagline: "Know what deserves your attention.",
    outcome: "For people who are serious about running their business without living inside their inbox.",
    features: [
      "6 connected integrations",
      "Unlimited automations",
      "Up to 3 team members",
      "Full AI and Copilot — summaries, reply drafts, lead scoring",
      "SMS inbox on your own number",
      "Client intelligence — where every relationship stands and what to do next",
    ],
  },
  BUSINESS: {
    key: "BUSINESS",
    name: "Business",
    priceCents: 8000,
    maxIntegrations: Infinity,
    maxAutomations: Infinity,
    maxTeamSeats: Infinity,
    smsEnabled: true,
    aiEnabled: true,
    copilotDailyLimit: Infinity,
    intelligenceEnabled: true,
    businessAgentEnabled: true,
    tagline: "Let Daythread run more of the business.",
    outcome: "For businesses that want Daythread to operate their workflow, not just organize it.",
    features: [
      "Unlimited connected integrations",
      "Unlimited automations",
      "Unlimited team members",
      "Full AI and Copilot",
      "Daythread Business Agent — proposes and carries out the day's work across conversations, bookings, calendars, follow-ups and payments",
      "Advanced analytics — what's at risk, what's converting, how fast you respond",
      "Advanced and custom workflows",
    ],
  },
};

export const PAID_PLAN_KEYS: PlanKey[] = ["PRO", "BUSINESS"];

/** Plans in ascending order, for "upgrade to the next one" prompts. */
export const PLAN_ORDER: PlanKey[] = ["FREE", "PRO", "BUSINESS"];

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

/** The smallest plan whose integration allowance is at least `needed`. */
export function planForIntegrations(needed: number): PlanKey {
  return PLAN_ORDER.find((k) => PLANS[k].maxIntegrations >= needed) ?? "BUSINESS";
}

export function canAddTeamSeat(business: BillingFields, currentSeatCount: number): boolean {
  return currentSeatCount < planLimits(business).maxTeamSeats;
}

/** Whether one more integration may become active given how many already are. */
export function canConnectIntegration(business: BillingFields, activeCount: number): boolean {
  return activeCount < planLimits(business).maxIntegrations;
}

/** Whether one more automation may be switched on given how many already are. */
export function canEnableAutomation(business: BillingFields, enabledCount: number): boolean {
  return enabledCount < planLimits(business).maxAutomations;
}

export function smsEntitled(business: BillingFields): boolean {
  return planLimits(business).smsEnabled;
}

/** Automations exist on every plan; Free is capped by count (see canEnableAutomation). */
export function automationsEntitled(business: BillingFields): boolean {
  return planLimits(business).maxAutomations > 0;
}

export function aiEntitled(business: BillingFields): boolean {
  return planLimits(business).aiEnabled;
}

export function intelligenceEntitled(business: BillingFields): boolean {
  return planLimits(business).intelligenceEnabled;
}

export function businessAgentEntitled(business: BillingFields): boolean {
  return planLimits(business).businessAgentEnabled;
}

/** Human form of a limit: "2", "6", or "Unlimited". */
export function limitLabel(n: number): string {
  return Number.isFinite(n) ? String(n) : "Unlimited";
}
