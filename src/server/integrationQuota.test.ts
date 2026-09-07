import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { activateIntegration, canActivate, integrationUsage, usageFor, QUOTA_PROVIDERS } from "./integrationQuota";
import type { IntegrationProvider } from "@prisma/client";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/**
 * The connected-channels quota against the real database: the exact Free/Pro sequences,
 * the concurrency guarantee (a burst of simultaneous attempts cannot exceed the
 * allowance), tenant scoping, reconnects, and what happens after a downgrade. Every
 * attempt here is the same call the OAuth callbacks and the Twilio action make.
 */
const cred = (p: IntegrationProvider) => ({ externalAccount: `${p.toLowerCase()}@example.com`, externalId: `${p}-id`, accessToken: "tok", refreshToken: "ref", wanted: false });
const connect = (businessId: string, provider: IntegrationProvider) => activateIntegration({ businessId, provider, create: cred(provider), update: cred(provider) });

describe("channel quota", () => {
  const ids: string[] = [];
  async function business(planTier: "FREE" | "PRO" | "BUSINESS", billingStatus: "ACTIVE" | "CANCELED" | null = planTier === "FREE" ? null : "ACTIVE") {
    const b = await prisma.business.create({ data: { name: `Quota ${planTier}`, handle: `quota-${planTier.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, planTier, billingStatus } });
    ids.push(b.id);
    return b.id;
  }
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  it("Free: 0 → 1 → 2 allowed, the third is rejected and nothing is written", async () => {
    const id = await business("FREE");
    expect((await connect(id, "EMAIL")).ok).toBe(true);
    expect((await connect(id, "INSTAGRAM")).ok).toBe(true);
    const third = await connect(id, "WHATSAPP");
    expect(third.ok).toBe(false);
    if (!third.ok) {
      expect(third.reason).toBe("limit");
      expect(third.usage).toMatchObject({ plan: "FREE", active: 2, limit: 2, atLimit: true, nextPlan: "PRO" });
    }
    expect(await prisma.integration.count({ where: { businessId: id, provider: "WHATSAPP" } })).toBe(0);
    expect(await prisma.integration.count({ where: { businessId: id, status: "CONNECTED" } })).toBe(2);
  });

  it("Pro: every channel connects; the plan is never full", async () => {
    const id = await business("PRO");
    for (const p of QUOTA_PROVIDERS) expect((await connect(id, p)).ok).toBe(true);
    const usage = await integrationUsage(id);
    expect(usage).toMatchObject({ plan: "PRO", active: QUOTA_PROVIDERS.length, limit: Infinity, atLimit: false, overQuota: false, nextPlan: null });
  });

  it("the hidden Business tier behaves as Pro: unlimited", async () => {
    const id = await business("BUSINESS");
    for (const p of QUOTA_PROVIDERS) expect((await connect(id, p)).ok).toBe(true);
    const usage = await integrationUsage(id);
    expect(usage).toMatchObject({ plan: "BUSINESS", active: QUOTA_PROVIDERS.length, limit: Infinity, atLimit: false, overQuota: false, nextPlan: null });
  });

  it("the plan is read from the database, never from the request: a paid tier whose subscription lapsed is held to Free's 2", async () => {
    const id = await business("PRO", "CANCELED");
    expect((await connect(id, "EMAIL")).ok).toBe(true);
    expect((await connect(id, "INSTAGRAM")).ok).toBe(true);
    const third = await connect(id, "WHATSAPP");
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.usage.plan).toBe("FREE");
  });

  it("concurrent attempts cannot exceed the allowance (Free, every provider at once → exactly 2 succeed)", async () => {
    const id = await business("FREE");
    const results = await Promise.all(QUOTA_PROVIDERS.map((p) => connect(id, p)));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok)).toHaveLength(QUOTA_PROVIDERS.length - 2);
    expect(await prisma.integration.count({ where: { businessId: id, status: "CONNECTED" } })).toBe(2);
  });

  it("concurrent attempts on Pro: all succeed, and a repeated burst adds nothing", async () => {
    const id = await business("PRO");
    const first = await Promise.all(QUOTA_PROVIDERS.map((p) => connect(id, p)));
    expect(first.every((r) => r.ok)).toBe(true);
    const again = await Promise.all(QUOTA_PROVIDERS.map((p) => connect(id, p)));
    expect(again.every((r) => r.ok)).toBe(true); // reconnects re-use their own slot
    expect(await prisma.integration.count({ where: { businessId: id, status: "CONNECTED" } })).toBe(QUOTA_PROVIDERS.length);
  });

  it("reconnecting an active provider does not consume a second slot; disconnected and failed rows hold none", async () => {
    const id = await business("FREE");
    expect((await connect(id, "EMAIL")).ok).toBe(true);
    expect((await connect(id, "EMAIL")).ok).toBe(true); // reconnect
    expect((await integrationUsage(id)).active).toBe(1);
    expect((await connect(id, "SMS")).ok).toBe(true);
    expect((await connect(id, "WHATSAPP")).ok).toBe(false);
    // Credentials revoked on the provider side: the slot frees up.
    await prisma.integration.update({ where: { businessId_provider: { businessId: id, provider: "SMS" } }, data: { status: "NEEDS_ATTENTION" } });
    expect((await canActivate(id, "WHATSAPP")).ok).toBe(true);
    expect((await connect(id, "WHATSAPP")).ok).toBe(true);
    // …and the revoked one now needs a slot to come back, which Free no longer has.
    expect((await connect(id, "SMS")).ok).toBe(false);
    // Disconnecting frees one.
    await prisma.integration.update({ where: { businessId_provider: { businessId: id, provider: "EMAIL" } }, data: { status: "NOT_CONNECTED", accessToken: null, refreshToken: null } });
    expect((await connect(id, "SMS")).ok).toBe(true);
  });

  it("quota is per inbox: another tenant's connections never count", async () => {
    const a = await business("FREE");
    const b = await business("FREE");
    for (const p of ["EMAIL", "INSTAGRAM"] as const) expect((await connect(a, p)).ok).toBe(true);
    expect((await integrationUsage(b)).active).toBe(0);
    expect((await connect(b, "EMAIL")).ok).toBe(true);
    expect((await connect(b, "WHATSAPP")).ok).toBe(true);
    expect((await connect(b, "SMS")).ok).toBe(false);
    expect((await integrationUsage(a)).active).toBe(2);
  });

  it("after a downgrade, existing connections are kept, the inbox is over quota, and nothing new connects until one is disconnected", async () => {
    const id = await business("PRO");
    for (const p of ["EMAIL", "INSTAGRAM", "WHATSAPP"] as const) expect((await connect(id, p)).ok).toBe(true);
    await prisma.business.update({ where: { id }, data: { planTier: "FREE", billingStatus: "CANCELED" } });
    const usage = await integrationUsage(id);
    expect(usage).toMatchObject({ plan: "FREE", active: 3, limit: 2, atLimit: true, overQuota: true });
    expect(await prisma.integration.count({ where: { businessId: id, status: "CONNECTED" } })).toBe(3); // nothing deleted
    expect((await connect(id, "SMS")).ok).toBe(false);
    expect((await connect(id, "EMAIL")).ok).toBe(true); // reconnecting what you have is fine
    for (const p of ["INSTAGRAM", "WHATSAPP"] as const) await prisma.integration.update({ where: { businessId_provider: { businessId: id, provider: p } }, data: { status: "NOT_CONNECTED" } });
    expect((await connect(id, "SMS")).ok).toBe(true);
  });

  it("the contact form, legacy rows and demo rows never count", () => {
    const rows = [{ provider: "WEBSITE" as const, status: "CONNECTED" as const }, { provider: "STRIPE" as const, status: "CONNECTED" as const }, { provider: "GOOGLE_CALENDAR" as const, status: "CONNECTED" as const }, { provider: "EMAIL" as const, status: "DEMO" as const }];
    expect(usageFor({ planTier: "FREE", billingStatus: null }, rows).active).toBe(0);
  });
});
