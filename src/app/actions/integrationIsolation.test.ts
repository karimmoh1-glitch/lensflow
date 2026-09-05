import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { disconnectIntegration, connectAppleCalendar } from "./connect";
import { deliverToCustomer } from "@/server/deliver";
import { getAvailableSlots } from "@/lib/availability";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

describe("integrations: tenant isolation, honest delivery, calendar busy time", () => {
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
    await prisma.integration.create({ data: { businessId: aId, provider: "APPLE_CALENDAR", status: "CONNECTED", externalAccount: "a@icloud.com", accessToken: "abcd-efgh-ijkl-mnop", settings: { calendarHref: "/cal/" } } });
  });
  afterAll(async () => {
    await prisma.business.delete({ where: { id: aId } });
    await prisma.business.delete({ where: { id: bId } });
  });

  it("Business B cannot disconnect (or even see) Business A's integration", async () => {
    const r = await disconnectIntegration("APPLE_CALENDAR", bSession);
    expect(r.error).toBeTruthy();
    const a = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: aId, provider: "APPLE_CALENDAR" } } });
    expect(a?.status).toBe("CONNECTED");
    expect(a?.accessToken).toBe("abcd-efgh-ijkl-mnop"); // still decrypts for its owner
  });

  it("stored credentials are encrypted at rest, not plaintext", async () => {
    const raw = await prisma.$queryRaw<Array<{ accessToken: string | null }>>`SELECT "accessToken" FROM "Integration" WHERE "businessId" = ${aId} AND provider = 'APPLE_CALENDAR'`;
    expect(raw[0].accessToken).toMatch(/^v1:/);
    expect(raw[0].accessToken).not.toContain("abcd-efgh");
  });

  it("refuses an Apple credential that isn't an app-specific password, without calling Apple", async () => {
    const r = await connectAppleCalendar("someone@icloud.com", "MyRealApplePassword1!", bSession);
    expect(r.error).toMatch(/app-specific password/i);
    expect(await prisma.integration.count({ where: { businessId: bId, provider: "APPLE_CALENDAR" } })).toBe(0);
  });

  it("Instagram and WhatsApp sends are NOT_DELIVERED when the channel isn't connected, and WhatsApp refuses outside the 24h window", async () => {
    const ig = await deliverToCustomer({ businessId: bId, businessName: "B", businessHandle: "b", channel: "INSTAGRAM", to: "igsid", body: "hi" });
    expect(ig.status).toBe("NOT_DELIVERED");
    await prisma.integration.create({ data: { businessId: bId, provider: "WHATSAPP", status: "CONNECTED", externalId: "pn_1", accessToken: "EAAtest", externalAccount: "+1" } });
    const stale = await deliverToCustomer({ businessId: bId, businessName: "B", businessHandle: "b", channel: "WHATSAPP", to: "+15550001111", body: "hi", lastInboundAt: new Date(Date.now() - 30 * 3600 * 1000) });
    expect(stale.status).toBe("NOT_DELIVERED");
    expect(stale.error).toMatch(/24-hour/);
    const revoked = await prisma.integration.update({ where: { businessId_provider: { businessId: bId, provider: "WHATSAPP" } }, data: { status: "NEEDS_ATTENTION" } });
    const needs = await deliverToCustomer({ businessId: bId, businessName: "B", businessHandle: "b", channel: "WHATSAPP", to: "+15550001111", body: "hi", lastInboundAt: new Date() });
    expect(needs.status).toBe("NOT_DELIVERED");
    expect(revoked.status).toBe("NEEDS_ATTENTION");
  });

  it("busy time on a connected calendar removes booking slots", async () => {
    await prisma.availability.create({ data: { businessId: aId, weekday: 3, startMin: 9 * 60, endMin: 12 * 60 } });
    // A Wednesday well in the future
    const day = new Date();
    day.setDate(day.getDate() + ((3 - day.getDay() + 7) % 7 || 7) + 14);
    const before = await getAvailableSlots(aId, day, 60);
    expect(before.length).toBeGreaterThan(0);
    const integration = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: aId, provider: "APPLE_CALENDAR" } } });
    await prisma.externalEvent.create({ data: { businessId: aId, integrationId: integration!.id, externalId: "/cal/dentist.ics", calendarId: "/cal/", title: "Dentist", startAt: before[0].start, endAt: before[0].end } });
    const after = await getAvailableSlots(aId, day, 60);
    expect(after.some((s) => s.start.getTime() === before[0].start.getTime())).toBe(false);
    expect(after.length).toBeLessThan(before.length); // the buffer around the event may take a neighbour too
  });
});
