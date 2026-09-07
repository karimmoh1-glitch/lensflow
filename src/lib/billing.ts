import type { Business } from "@prisma/client";

/**
 * Daythread's own plans — what a person pays US for the inbox. Two plans that anyone can
 * understand: Free to use Daythread on your own, Pro to connect everything and work as a
 * team. BUSINESS remains in the database enum for older subscriptions and is treated as
 * Pro; it is never shown or sold.
 *
 * Numbers here are enforced server-side at the point each resource is created or activated
 * (src/server/integrationQuota.ts, invitations.ts). The UI only reflects them.
 */
export type PlanKey = "FREE" | "PRO" | "BUSINESS";

export const PLANS: Record<
  PlanKey,
  {
    key: PlanKey;
    name: string;
    priceCents: number; // per month; 0 for Free
    /** Connected channels (Gmail, Instagram, WhatsApp, SMS). Infinity = all of them. */
    maxIntegrations: number;
    maxTeamSeats: number; // Infinity = unlimited
    smsEnabled: boolean;
    /** AI-drafted replies and conversation summaries. */
    aiEnabled: boolean;
    /** Team collaboration: invite teammates, assign conversations. */
    teamEnabled: boolean;
    /** Not shown on pricing or billing. */
    hidden?: boolean;
    tagline: string;
    outcome: string;
    features: string[];
  }
> = {
  FREE: {
    key: "FREE",
    name: "Free",
    priceCents: 0,
    maxIntegrations: 2,
    maxTeamSeats: 1,
    smsEnabled: false,
    aiEnabled: false,
    teamEnabled: false,
    tagline: "One inbox, on your own.",
    outcome: "Every conversation from two channels, in one place.",
    features: ["2 connected channels", "One unified inbox", "Search and history", "Just you"],
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    priceCents: 2000,
    maxIntegrations: Infinity,
    maxTeamSeats: 5,
    smsEnabled: true,
    aiEnabled: true,
    teamEnabled: true,
    tagline: "Every channel, and your team.",
    outcome: "All your channels in one inbox, with the people who answer alongside you.",
    features: ["All channels — Gmail, Instagram, WhatsApp, SMS", "Up to 5 team members, with assignment", "AI-drafted replies and summaries", "A dedicated text number"],
  },
  BUSINESS: {
    key: "BUSINESS",
    name: "Pro",
    priceCents: 8000,
    maxIntegrations: Infinity,
    maxTeamSeats: Infinity,
    smsEnabled: true,
    aiEnabled: true,
    teamEnabled: true,
    hidden: true,
    tagline: "Every channel, and your team.",
    outcome: "All your channels in one inbox, with the people who answer alongside you.",
    features: [],
  },
};

export const PAID_PLAN_KEYS: PlanKey[] = ["PRO", "BUSINESS"];
/** Plans shown to people. */
export const VISIBLE_PLANS: PlanKey[] = ["FREE", "PRO"];
export const PLAN_ORDER: PlanKey[] = ["FREE", "PRO", "BUSINESS"];

const ENTITLED_STATUSES = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

type BillingFields = Pick<Business, "planTier" | "billingStatus">;

/** The plan a workspace actually has right now — never planTier alone. A lapsed paid
 * subscription falls back to Free. */
export function effectivePlan(business: BillingFields): PlanKey {
  if (business.planTier === "FREE") return "FREE";
  if (business.billingStatus && ENTITLED_STATUSES.has(business.billingStatus)) return business.planTier as PlanKey;
  return "FREE";
}

export function planLimits(business: BillingFields) {
  return PLANS[effectivePlan(business)];
}

/** The smallest plan whose channel allowance is at least `needed`. */
export function planForIntegrations(needed: number): PlanKey {
  return PLAN_ORDER.find((k) => !PLANS[k].hidden && PLANS[k].maxIntegrations >= needed) ?? "PRO";
}

export function canAddTeamSeat(business: BillingFields, currentSeatCount: number): boolean {
  return currentSeatCount < planLimits(business).maxTeamSeats;
}

export function canConnectIntegration(business: BillingFields, activeCount: number): boolean {
  return activeCount < planLimits(business).maxIntegrations;
}

export function smsEntitled(business: BillingFields): boolean {
  return planLimits(business).smsEnabled;
}

export function aiEntitled(business: BillingFields): boolean {
  return planLimits(business).aiEnabled;
}

export function teamEntitled(business: BillingFields): boolean {
  return planLimits(business).teamEnabled;
}

/** Older call sites: assignment and shared-inbox features are the team feature. */
export const intelligenceEntitled = teamEntitled;

export function limitLabel(n: number): string {
  return Number.isFinite(n) ? String(n) : "Unlimited";
}
