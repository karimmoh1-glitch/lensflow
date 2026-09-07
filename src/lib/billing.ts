import type { Business } from "@prisma/client";

/**
 * Daythread's own subscription plans — what a workspace pays US. Stripe exists for this
 * and nothing else: Daythread never collects money from a workspace's customers.
 *
 * This is the single source of truth for pricing and entitlements: everything else asks
 * `effectivePlan(business)` / `planLimits(business)` / the `*Entitled(...)` helpers rather
 * than re-deriving plan logic at each call site. Numbers here are enforced server-side at
 * the point each resource is created or activated (src/server/integrationQuota.ts,
 * src/app/actions/automations.ts, invitations.ts, agent.ts). The UI only reflects them.
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
    /** AI summaries and reply drafts. */
    aiEnabled: boolean;
    /** Assistant questions per day. Infinity = unlimited (the hourly abuse cap still applies). */
    copilotDailyLimit: number;
    /** The assistant's proposals and approved sends. */
    businessAgentEnabled: boolean;
    /** Approved agent sends per hour. */
    agentHourlyLimit: number;
    /** Team: shared inbox, assignment, internal notes, roles. */
    teamEnabled: boolean;
    /** The executive view on the Today page: what's at risk, who owns what. */
    intelligenceEnabled: boolean;
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
    businessAgentEnabled: false,
    agentHourlyLimit: 0,
    teamEnabled: false,
    intelligenceEnabled: false,
    tagline: "I can manage my inbox.",
    outcome: "Every conversation from two channels in one place, sorted by who is waiting, with the calendar and bookings — on your own.",
    features: ["2 connected channels or calendars", "One inbox: priority sorting, search, classification, replies", "Calendar and bookings from any conversation", "3 automations", "5 assistant questions a day", "Just you"],
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    priceCents: 2000,
    maxIntegrations: Infinity,
    maxAutomations: Infinity,
    maxTeamSeats: 5,
    smsEnabled: true,
    aiEnabled: true,
    copilotDailyLimit: Infinity,
    businessAgentEnabled: true,
    agentHourlyLimit: 20,
    teamEnabled: true,
    intelligenceEnabled: false,
    tagline: "Daythread helps me manage my work.",
    outcome: "Every channel, AI on every thread, an assistant that proposes the day's work, and up to five people on the same inbox.",
    features: ["All channels — Gmail, Instagram, WhatsApp, SMS — and both calendars", "A dedicated text number", "AI summaries and reply drafts", "The assistant proposes replies, confirmations and follow-ups — you approve", "Unlimited automations", "Up to 5 people on one shared inbox, with assignment"],
  },
  BUSINESS: {
    key: "BUSINESS",
    name: "Business",
    priceCents: 5000,
    maxIntegrations: Infinity,
    maxAutomations: Infinity,
    maxTeamSeats: 10,
    smsEnabled: true,
    aiEnabled: true,
    copilotDailyLimit: Infinity,
    businessAgentEnabled: true,
    agentHourlyLimit: 60,
    teamEnabled: true,
    intelligenceEnabled: true,
    tagline: "Daythread helps run my business.",
    outcome: "The assistant works across the whole business — what's at risk, who owns what, what to do first — with three times the sending capacity and up to ten people.",
    features: ["Everything in Pro", "Up to 10 people, with roles and internal notes", "Business-wide view every morning: what's at risk, who owns what", "The assistant sends three times as much — 60 approved actions an hour", "Business memory: services, hours and history in every proposal", "Priority support"],
  },
};

export const PAID_PLAN_KEYS: PlanKey[] = ["PRO", "BUSINESS"];
/** Plans shown to people, in ascending order. */
export const VISIBLE_PLANS: PlanKey[] = ["FREE", "PRO", "BUSINESS"];
export const PLAN_ORDER: PlanKey[] = ["FREE", "PRO", "BUSINESS"];

// Stripe's own dunning (Smart Retries) owns the PAST_DUE -> CANCELED/UNPAID transition;
// keeping access through PAST_DUE means one failed card never locks someone out.
const ENTITLED_STATUSES = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

type BillingFields = Pick<Business, "planTier" | "billingStatus">;

/** The plan a workspace actually has right now — never planTier alone. A lapsed paid
 * subscription falls back to Free. */
export const TRIAL_DAYS = 7;
/** A business gets one 7-day Pro trial, before it has ever had a subscription. */
export function trialEligible(business: { stripeSubscriptionId: string | null; trialUsedAt: Date | null; billingStatus: string | null }): boolean {
  return !business.stripeSubscriptionId && !business.trialUsedAt && business.billingStatus !== "TRIALING";
}

export function effectivePlan(business: BillingFields): PlanKey {
  if (business.planTier === "FREE") return "FREE";
  if (business.billingStatus && ENTITLED_STATUSES.has(business.billingStatus)) return business.planTier as PlanKey;
  return "FREE";
}

export function planLimits(business: BillingFields) {
  return PLANS[effectivePlan(business)];
}

/** The smallest plan whose integration allowance is at least `needed`. */
export function planForIntegrations(needed: number): PlanKey {
  return PLAN_ORDER.find((k) => PLANS[k].maxIntegrations >= needed) ?? "BUSINESS";
}

/** The next plan up, for upgrade prompts. */
export function nextPlan(plan: PlanKey): PlanKey | null {
  const i = PLAN_ORDER.indexOf(plan);
  return PLAN_ORDER[i + 1] ?? null;
}

export function canAddTeamSeat(business: BillingFields, currentSeatCount: number): boolean {
  return currentSeatCount < planLimits(business).maxTeamSeats;
}

export function canConnectIntegration(business: BillingFields, activeCount: number): boolean {
  return activeCount < planLimits(business).maxIntegrations;
}

export function canEnableAutomation(business: BillingFields, enabledCount: number): boolean {
  return enabledCount < planLimits(business).maxAutomations;
}

export function smsEntitled(business: BillingFields): boolean {
  return planLimits(business).smsEnabled;
}

export function automationsEntitled(business: BillingFields): boolean {
  return planLimits(business).maxAutomations > 0;
}

export function aiEntitled(business: BillingFields): boolean {
  return planLimits(business).aiEnabled;
}

export function teamEntitled(business: BillingFields): boolean {
  return planLimits(business).teamEnabled;
}

export function intelligenceEntitled(business: BillingFields): boolean {
  return planLimits(business).intelligenceEnabled;
}

export function businessAgentEntitled(business: BillingFields): boolean {
  return planLimits(business).businessAgentEnabled;
}

/** Human form of a limit: "2", "10", or "Unlimited". */
export function limitLabel(n: number): string {
  return Number.isFinite(n) ? String(n) : "Unlimited";
}
