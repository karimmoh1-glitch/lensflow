import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { pruneOperationalRows, OPS_EVENT_RETENTION_DAYS, AI_CALL_RETENTION_DAYS } from "./integrationMaintenance";

/** The daily prune removes old failures and old AI call records, and nothing else. */
describe("retention", () => {
  const ids: string[] = [];
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); });

  it("drops ops events past 90 days and ai_call rows past 180 days; keeps recent rows and product analytics", async () => {
    const b = await prisma.business.create({ data: { name: "Retention", handle: `retention-${Date.now()}` } });
    ids.push(b.id);
    const old = (days: number) => new Date(Date.now() - days * 86_400_000);
    await prisma.opsEvent.createMany({ data: [
      { area: "sync", message: "old", businessId: b.id, createdAt: old(OPS_EVENT_RETENTION_DAYS + 1) },
      { area: "sync", message: "recent", businessId: b.id, createdAt: old(1) },
    ] });
    await prisma.analyticsEvent.createMany({ data: [
      { name: "ai_call", businessId: b.id, createdAt: old(AI_CALL_RETENTION_DAYS + 1) },
      { name: "ai_call", businessId: b.id, createdAt: old(10) },
      { name: "signup_completed", businessId: b.id, createdAt: old(400) },
    ] });
    const r = await pruneOperationalRows();
    expect(r.opsEvents).toBeGreaterThanOrEqual(1);
    expect(r.aiCalls).toBeGreaterThanOrEqual(1);
    expect(await prisma.opsEvent.count({ where: { businessId: b.id } })).toBe(1);
    expect(await prisma.analyticsEvent.count({ where: { businessId: b.id, name: "ai_call" } })).toBe(1);
    expect(await prisma.analyticsEvent.count({ where: { businessId: b.id, name: "signup_completed" } })).toBe(1);
  });
});
