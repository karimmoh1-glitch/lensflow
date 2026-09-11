import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileRole, isErrorResponse } from "@/lib/mobileApi";
import { PROVIDERS, providerConfigured, displayStatus } from "@/lib/integrations/registry";
import { usageFor, QUOTA_PROVIDERS } from "@/server/integrationQuota";
import { PLANS } from "@/lib/billing";
import { STAFF_ROLES } from "@/lib/auth";

/** Real integration status, straight from the Integration table — DEMO is reported as
 * DEMO, never upgraded to look like CONNECTED — plus the plan's connected-integrations
 * allowance, computed by the same code that refuses a connection on the server. */
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;

  const rows = await prisma.integration.findMany({ where: { businessId: ctx.business.id } });
  const usage = usageFor(ctx.business, rows);
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const integrations = QUOTA_PROVIDERS.map((provider) => {
    const spec = PROVIDERS[provider as keyof typeof PROVIDERS];
    const row = byProvider.get(provider) ?? null;
    const configured = providerConfigured(spec);
    return { provider, name: spec.name, kind: spec.kind, status: row?.status ?? "NOT_CONNECTED", display: displayStatus(spec, row, configured), account: row?.externalAccount ?? null, lastSyncedAt: row?.lastSyncedAt ?? null, configured };
  });

  return NextResponse.json({
    plan: usage.plan,
    planName: PLANS[usage.plan].name,
    quota: { active: usage.active, limit: Number.isFinite(usage.limit) ? usage.limit : null, atLimit: usage.atLimit, overQuota: usage.overQuota, nextPlan: usage.nextPlan },
    integrations,
    // Legacy shape kept for the existing app build.
    legacy: rows.map((r) => ({ provider: r.provider, status: r.status, externalAccount: r.externalAccount, lastSyncedAt: r.lastSyncedAt })),
  });
}
