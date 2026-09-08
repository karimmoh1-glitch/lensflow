import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import { trackReferralMilestone } from "@/server/referral";
import { PLANS, effectivePlan, planForIntegrations, type PlanKey } from "@/lib/billing";
import type { Integration, IntegrationProvider, IntegrationStatus, Prisma } from "@prisma/client";

/**
 * The connected-integrations quota, enforced where an integration actually becomes active.
 *
 * Every path that turns an Integration row CONNECTED — the Google callback (Gmail and
 * Google Calendar), the Instagram and WhatsApp callbacks, the Apple Calendar action and the
 * Twilio number claim — goes through `activateIntegration`. It runs inside one database
 * transaction that first takes a row lock on the Business, so concurrent attempts for the
 * same workspace serialize: the count is read after the lock, the row is written before the
 * lock is released, and the plan is read from the locked row itself (never from the
 * request). Nothing the browser sends can change the outcome.
 *
 * What counts: one slot per provider in QUOTA_PROVIDERS whose row is active (CONNECTED or
 * SYNC_ERROR — credentials still work). NOT_CONNECTED, NEEDS_ATTENTION (credentials dead),
 * ERROR and legacy DEMO rows hold no slot, so a failed or abandoned connection never uses
 * up the allowance. Reconnecting an already-active provider re-uses its own slot.
 */
export const QUOTA_PROVIDERS: IntegrationProvider[] = ["EMAIL", "GOOGLE_CALENDAR", "APPLE_CALENDAR", "INSTAGRAM", "WHATSAPP", "SMS"];
export const ACTIVE_STATUSES: IntegrationStatus[] = ["CONNECTED", "SYNC_ERROR"];

export function countsTowardQuota(row: { provider: IntegrationProvider; status: IntegrationStatus }): boolean {
  return QUOTA_PROVIDERS.includes(row.provider) && ACTIVE_STATUSES.includes(row.status);
}

export type IntegrationUsage = {
  plan: PlanKey;
  active: number;
  limit: number; // Infinity for unlimited
  /** No free slot for a new provider. */
  atLimit: boolean;
  /** More active than the plan allows (after a downgrade). Existing connections are kept. */
  overQuota: boolean;
  /** The smallest plan that would allow one more connection, or null when already unlimited. */
  nextPlan: PlanKey | null;
};

export function usageFor(business: { planTier: PlanKey; billingStatus: string | null }, rows: Array<{ provider: IntegrationProvider; status: IntegrationStatus }>): IntegrationUsage {
  const plan = effectivePlan(business as Parameters<typeof effectivePlan>[0]);
  const limit = PLANS[plan].maxIntegrations;
  const active = rows.filter(countsTowardQuota).length;
  const atLimit = active >= limit;
  const next = Number.isFinite(limit) ? planForIntegrations(active + 1) : null;
  return { plan, active, limit, atLimit, overQuota: active > limit, nextPlan: next && next !== plan ? next : Number.isFinite(limit) ? "BUSINESS" : null };
}

export async function integrationUsage(businessId: string): Promise<IntegrationUsage> {
  const [business, rows] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { planTier: true, billingStatus: true, compedPlan: true } }),
    prisma.integration.findMany({ where: { businessId }, select: { provider: true, status: true } }),
  ]);
  return usageFor(business, rows);
}

/** Cheap pre-check used before sending someone off to a provider's consent screen. The
 * transactional check in `activateIntegration` is the one that decides. */
export async function canActivate(businessId: string, provider: IntegrationProvider): Promise<{ ok: true } | { ok: false; usage: IntegrationUsage }> {
  const [business, rows] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { planTier: true, billingStatus: true, compedPlan: true } }),
    prisma.integration.findMany({ where: { businessId }, select: { provider: true, status: true } }),
  ]);
  const usage = usageFor(business, rows);
  const alreadyActive = rows.some((r) => r.provider === provider && countsTowardQuota(r));
  if (alreadyActive || !QUOTA_PROVIDERS.includes(provider)) return { ok: true };
  return usage.atLimit ? { ok: false, usage } : { ok: true };
}

export type ActivationResult = { ok: true; row: Integration } | { ok: false; reason: "limit"; usage: IntegrationUsage };

/**
 * Makes `provider` active for `businessId` — or refuses — atomically.
 *
 * `create` / `update` are the row contents for the upsert (status is forced to CONNECTED).
 * The caller decides what to do with provider-side artifacts on refusal (revoke the Google
 * grant, release the Twilio number): nothing about them is stored.
 */
export async function activateIntegration(params: {
  businessId: string;
  provider: IntegrationProvider;
  create: Omit<Prisma.IntegrationUncheckedCreateInput, "businessId" | "provider" | "status">;
  update: Omit<Prisma.IntegrationUncheckedUpdateInput, "businessId" | "provider" | "status">;
}): Promise<ActivationResult> {
  const { businessId, provider } = params;
  const result = await prisma.$transaction(
    async (tx) => {
      // Serialize every activation for this workspace: the lock is held until commit.
      const locked = await tx.$queryRaw<Array<{ id: string; planTier: PlanKey; billingStatus: string | null; compedPlan: PlanKey | null }>>`SELECT "id", "planTier", "billingStatus", "compedPlan" FROM "Business" WHERE "id" = ${businessId} FOR UPDATE`;
      const business = locked[0];
      if (!business) throw new Error("Business not found");
      const rows = await tx.integration.findMany({ where: { businessId }, select: { provider: true, status: true } });
      const usage = usageFor(business, rows);
      const alreadyActive = rows.some((r) => r.provider === provider && countsTowardQuota(r));
      if (QUOTA_PROVIDERS.includes(provider) && !alreadyActive && usage.atLimit) {
        return { ok: false as const, reason: "limit" as const, usage };
      }
      const firstEver = !rows.some((r) => r.status === "CONNECTED");
      const row = await tx.integration.upsert({
        where: { businessId_provider: { businessId, provider } },
        create: { ...params.create, businessId, provider, status: "CONNECTED" },
        update: { ...params.update, status: "CONNECTED" },
      });
      return { ok: true as const, row, firstEver };
    },
    { isolationLevel: "ReadCommitted", timeout: 15_000 }
  );
  // After commit, never inside: the event row references the Business row the transaction
  // held FOR UPDATE, and its foreign-key check would wait on that lock.
  if (result.ok && result.firstEver) {
    await track("first_channel_connected", { businessId, properties: { provider } });
    await trackReferralMilestone(businessId, "referral_activated", { provider });
  }
  return result;
}

/** The sentence shown when a connection is refused for the plan. */
export function limitMessage(usage: IntegrationUsage): string {
  const plan = PLANS[usage.plan];
  const next = usage.nextPlan ? PLANS[usage.nextPlan].name : null;
  const allowance = `${plan.name} includes ${usage.limit} connection${usage.limit === 1 ? "" : "s"}.`;
  return next ? `Connection limit reached. ${allowance} Upgrade to ${next} to connect more.` : `Connection limit reached. ${allowance}`;
}
