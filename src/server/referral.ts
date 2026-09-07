import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import { generateReferralCode, isReferralCode } from "@/lib/referral";

/** The workspace's share code, created on first request. Unique by lookup-before-assign. */
export async function ensureReferralCode(businessId: string): Promise<string> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { referralCode: true } });
  if (b?.referralCode) return b.referralCode;
  for (let i = 0; i < 5; i++) {
    const code = generateReferralCode();
    const taken = await prisma.business.findFirst({ where: { referralCode: code }, select: { id: true } });
    if (taken) continue;
    const updated = await prisma.business.updateMany({ where: { id: businessId, referralCode: null }, data: { referralCode: code } });
    if (updated.count === 1) return code;
    const again = await prisma.business.findUnique({ where: { id: businessId }, select: { referralCode: true } });
    if (again?.referralCode) return again.referralCode;
  }
  throw new Error("Could not allocate a referral code");
}

/**
 * Attribute a new workspace to the workspace whose link brought it. Only the id is kept;
 * an unknown or malformed code is ignored, and a workspace can never refer itself.
 */
export async function attributeReferral(businessId: string, code: unknown, anonymousId?: string | null): Promise<string | null> {
  if (!isReferralCode(code)) return null;
  const referrer = await prisma.business.findFirst({ where: { referralCode: code }, select: { id: true } });
  if (!referrer || referrer.id === businessId) return null;
  await prisma.business.update({ where: { id: businessId }, data: { referredById: referrer.id } });
  await track("referral_signup", { businessId, anonymousId: anonymousId ?? undefined, properties: { referrerBusinessId: referrer.id } });
  return referrer.id;
}

/** Later milestones, recorded against the referred workspace with the referrer's id. */
export async function trackReferralMilestone(businessId: string, name: "referral_activated" | "referral_converted", properties: Record<string, unknown> = {}): Promise<void> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { referredById: true } });
  if (!b?.referredById) return;
  const already = await prisma.analyticsEvent.count({ where: { businessId, name } });
  if (already > 0) return;
  await track(name, { businessId, properties: { referrerBusinessId: b.referredById, ...properties } });
}
