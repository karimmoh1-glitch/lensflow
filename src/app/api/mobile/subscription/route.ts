import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { PLANS, effectivePlan, planLimits, trialEligible } from "@/lib/billing";
import { STAFF_ROLES } from "@/lib/auth";

/** Where the workspace stands with billing — read from the record Stripe's webhook wrote. Changing plans happens on the web (Stripe-hosted). */
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const b = ctx.business;
  const plan = effectivePlan(b);
  const limits = planLimits(b);
  return NextResponse.json({
    plan,
    planName: PLANS[plan].name,
    billingStatus: b.billingStatus,
    comped: Boolean(b.compedPlan && b.compedPlan !== "FREE"),
    trialEligible: trialEligible(b),
    trialEndsAt: b.trialEndsAt,
    currentPeriodEnd: b.currentPeriodEnd,
    limits: { seats: Number.isFinite(limits.maxTeamSeats) ? limits.maxTeamSeats : null, automations: Number.isFinite(limits.maxAutomations) ? limits.maxAutomations : null },
    canManage: ctx.role === "OWNER",
    manageUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/settings?tab=subscription`,
  });
}
