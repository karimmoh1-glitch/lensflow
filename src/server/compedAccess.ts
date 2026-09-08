import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import type { PlanTier } from "@prisma/client";

/**
 * Complimentary plan access, for design partners and the team's own workspaces.
 *
 * `COMPED_BUSINESS_EMAILS` is a comma-separated list of addresses that get Business on
 * the workspaces they own, applied the next time they sign up or sign in, so an account
 * that does not exist yet is covered the moment it does. It writes `Business.compedPlan`
 * and never `planTier` or `billingStatus`, so Stripe stays the only source of truth for
 * what anyone is paying: a comped workspace is never counted in MRR or in "paying now".
 *
 * Removing an address from the list stops new grants; it does not revoke one already
 * given, which stays a deliberate action.
 */
export function compedEmails(): string[] {
  return (process.env.COMPED_BUSINESS_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isCompedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return compedEmails().includes(email.trim().toLowerCase());
}

/**
 * Grants Business on every workspace this person owns, if their address is on the list.
 * Idempotent, and never downgrades: a workspace already comped at the same tier is left
 * alone. Failure is swallowed — a sign-in must never break because a grant did not apply.
 */
export async function applyCompedAccess(userId: string, email: string | null | undefined, tier: PlanTier = "BUSINESS"): Promise<number> {
  if (!isCompedEmail(email)) return 0;
  try {
    const owned = await prisma.orgMembership.findMany({
      where: { userId, role: "OWNER", status: "ACTIVE" },
      select: { businessId: true, business: { select: { compedPlan: true } } },
    });
    const pending = owned.filter((m) => m.business.compedPlan !== tier).map((m) => m.businessId);
    if (pending.length === 0) return 0;
    await prisma.business.updateMany({ where: { id: { in: pending } }, data: { compedPlan: tier } });
    for (const businessId of pending) {
      await track("comped_access_granted", { businessId, properties: { tier, reason: "email_list" } });
    }
    return pending.length;
  } catch (err) {
    console.error("[comped] could not apply complimentary access", err);
    return 0;
  }
}
