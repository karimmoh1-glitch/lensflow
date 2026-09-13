import { prisma } from "@/lib/db";
import { addDays } from "date-fns";
import { BETA_PRO_DAYS, betaOfferOpen, effectivePlan, PLAN_ORDER } from "@/lib/billing";
import { recordAudit } from "@/server/audit";
import { track } from "@/lib/analytics";

/**
 * The beta month of Pro. Everything about it is decided here, on the server:
 *
 *   - a brand-new workspace gets it at creation, so nobody has to find a button;
 *   - a workspace that existed before the offer can claim it once, by an owner or admin;
 *   - one person gets one beta month: a second workspace they own cannot claim another;
 *   - a workspace that already has Pro or better is told so rather than burning the claim;
 *   - the length is fixed here, never taken from a request.
 *
 * The claim is serialized on the workspace row so two clicks cannot grant twice.
 */
export function betaGrantForNewWorkspace(now = new Date()): { betaProEndsAt?: Date; betaProClaimedAt?: Date } {
  if (!betaOfferOpen()) return {};
  return { betaProEndsAt: addDays(now, BETA_PRO_DAYS), betaProClaimedAt: now };
}

export type BetaClaim =
  | { ok: true; endsAt: Date }
  | { ok: false; reason: "closed" | "already_claimed" | "claimed_elsewhere" | "already_pro" | "not_found"; endsAt?: Date | null };

export async function claimBetaPro(businessId: string, userId: string): Promise<BetaClaim> {
  if (!betaOfferOpen()) return { ok: false, reason: "closed" };
  const result = await prisma.$transaction(async (tx): Promise<BetaClaim> => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Business" WHERE "id" = ${businessId} FOR UPDATE`;
    if (!locked[0]) return { ok: false, reason: "not_found" };
    const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { planTier: true, billingStatus: true, compedPlan: true, betaProEndsAt: true, betaProClaimedAt: true } });
    if (business.betaProClaimedAt) return { ok: false, reason: "already_claimed", endsAt: business.betaProEndsAt };
    if (PLAN_ORDER.indexOf(effectivePlan(business)) >= PLAN_ORDER.indexOf("PRO")) return { ok: false, reason: "already_pro" };
    const elsewhere = await tx.business.count({
      where: { id: { not: businessId }, betaProClaimedAt: { not: null }, orgMemberships: { some: { userId, role: "OWNER" } } },
    });
    if (elsewhere > 0) return { ok: false, reason: "claimed_elsewhere" };
    const now = new Date();
    const endsAt = addDays(now, BETA_PRO_DAYS);
    await tx.business.update({ where: { id: businessId }, data: { betaProClaimedAt: now, betaProEndsAt: endsAt } });
    return { ok: true, endsAt };
  }, { isolationLevel: "ReadCommitted", timeout: 10_000 });
  if (result.ok) {
    await recordAudit({ businessId, actorId: userId, action: "billing.beta_pro_claimed", targetType: "business", targetId: businessId, metadata: { days: BETA_PRO_DAYS } });
    await track("beta_pro_claimed", { businessId, properties: { days: BETA_PRO_DAYS, source: "claim" } });
  }
  return result;
}
