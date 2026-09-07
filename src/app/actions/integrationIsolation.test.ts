import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { disconnectIntegration } from "./connect";
import { deliverToCustomer } from "@/server/deliver";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

describe("channels: tenant isolation and honest delivery", () => {
  let aId: string;
  let bId: string;
  let bSession: { userId: string; activeBusinessId: string };
  beforeAll(async () => {
    const stamp = Date.now();
    aId = (await prisma.business.create({ data: { name: "Int A", handle: `int-a-${stamp}`, timezone: "America/Chicago" } })).id;
    bId = (await prisma.business.create({ data: { name: "Int B", handle: `int-b-${stamp}`, planTier: "PRO", billingStatus: "ACTIVE" } })).id;
    const bOwner = await prisma.user.create({ data: { name: "B", email: `b-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: bOwner.id, businessId: bId, role: "OWNER" } });
    bSession = { userId: bOwner.id, activeBusinessId: bId };
    await prisma.integration.create({ data: { businessId: aId, provider: "INSTAGRAM", status: "CONNECTED", externalAccount: "a.studio", externalId: "ig_a", accessToken: "IGQVJ-secret-token-a" } });
  });
  afterAll(async () => {
    await prisma.business.delete({ where: { id: aId } });
    await prisma.business.delete({ where: { id: bId } });
  });

  it("Inbox B cannot disconnect (or even see) Inbox A's channel", async () => {
    const r = await disconnectIntegration("INSTAGRAM", bSession);
    expect(r.error).toBeTruthy();
    const a = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: aId, provider: "INSTAGRAM" } } });
    expect(a?.status).toBe("CONNECTED");
    expect(a?.accessToken).toBe("IGQVJ-secret-token-a"); // still decrypts for its owner
  });

  it("stored credentials are encrypted at rest, not plaintext", async () => {
    const raw = await prisma.$queryRaw<Array<{ accessToken: string | null }>>`SELECT "accessToken" FROM "Integration" WHERE "businessId" = ${aId} AND provider = 'INSTAGRAM'`;
    expect(raw[0].accessToken).toMatch(/^v1:/);
    expect(raw[0].accessToken).not.toContain("secret-token");
  });

  it("Instagram and WhatsApp sends are NOT_DELIVERED when the channel isn't connected, and WhatsApp refuses outside the 24h window", async () => {
    const ig = await deliverToCustomer({ businessId: bId, businessName: "B", businessHandle: "b", channel: "INSTAGRAM", to: "igsid", body: "hi" });
    expect(ig.status).toBe("NOT_DELIVERED");
    await prisma.integration.create({ data: { businessId: bId, provider: "WHATSAPP", status: "CONNECTED", externalId: "pn_1", accessToken: "EAAtest", externalAccount: "+1" } });
    const stale = await deliverToCustomer({ businessId: bId, businessName: "B", businessHandle: "b", channel: "WHATSAPP", to: "+15550001111", body: "hi", lastInboundAt: new Date(Date.now() - 30 * 3600 * 1000) });
    expect(stale.status).toBe("NOT_DELIVERED");
    expect(stale.error).toMatch(/24[- ]hour/);
    const revoked = await prisma.integration.update({ where: { businessId_provider: { businessId: bId, provider: "WHATSAPP" } }, data: { status: "NEEDS_ATTENTION" } });
    const needs = await deliverToCustomer({ businessId: bId, businessName: "B", businessHandle: "b", channel: "WHATSAPP", to: "+15550001111", body: "hi", lastInboundAt: new Date() });
    expect(needs.status).toBe("NOT_DELIVERED");
    expect(revoked.status).toBe("NEEDS_ATTENTION");
  });
});
