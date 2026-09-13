import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { settleAfterSuccessfulSync, integrationUsage } from "@/server/integrationQuota";

/**
 * A connection that needed attention holds no plan slot. When a background sync later
 * succeeds on it, it may only become CONNECTED through the same locked quota check as a
 * fresh connection — never by a sync writing the status directly.
 */
const ids: string[] = [];
afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); });

async function freeWorkspace() {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const b = await prisma.business.create({ data: { name: `Sync ${s}`, handle: `sync-${s}`, planTier: "FREE" } });
  ids.push(b.id);
  return b.id;
}

describe("a successful sync and the plan's connection limit", () => {
  it("a full Free workspace does not get a recovered connection back for free", async () => {
    const businessId = await freeWorkspace();
    const limit = (await integrationUsage(businessId)).limit;
    const fill = ["APPLE_CALENDAR", "SMS", "INSTAGRAM"].slice(0, limit) as Array<"APPLE_CALENDAR" | "SMS" | "INSTAGRAM">;
    for (const provider of fill) await prisma.integration.create({ data: { businessId, provider, status: "CONNECTED" } });
    const gmail = await prisma.integration.create({ data: { businessId, provider: "EMAIL", status: "NEEDS_ATTENTION", refreshToken: "r" } });
    expect(await settleAfterSuccessfulSync(gmail)).toBe("NEEDS_ATTENTION");
    const after = await prisma.integration.findUniqueOrThrow({ where: { id: gmail.id } });
    expect(after.status).toBe("NEEDS_ATTENTION");
    expect(after.lastError).toMatch(/limit/i);
    expect((await integrationUsage(businessId)).active).toBe(limit);
  });

  it("with a free slot it comes back; a row that was only failing to sync always does", async () => {
    const businessId = await freeWorkspace();
    const outlook = await prisma.integration.create({ data: { businessId, provider: "MICROSOFT_OUTLOOK", status: "NEEDS_ATTENTION", refreshToken: "r" } });
    expect(await settleAfterSuccessfulSync(outlook)).toBe("CONNECTED");
    const flaky = await prisma.integration.create({ data: { businessId, provider: "CALENDLY", status: "SYNC_ERROR", refreshToken: "r" } });
    expect(await settleAfterSuccessfulSync(flaky)).toBe("CONNECTED");
    const off = await prisma.integration.create({ data: { businessId, provider: "SLACK", status: "NOT_CONNECTED" } });
    expect(await settleAfterSuccessfulSync(off)).toBe("NOT_CONNECTED");
  });
});
