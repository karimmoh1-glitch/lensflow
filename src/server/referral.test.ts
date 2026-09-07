import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { ensureReferralCode, attributeReferral, trackReferralMilestone } from "./referral";
import { isReferralCode, generateReferralCode } from "@/lib/referral";

let referrer: string, referred: string;
beforeAll(async () => {
  referrer = (await prisma.business.create({ data: { name: "Referrer", handle: `referrer-${Date.now()}` } })).id;
  referred = (await prisma.business.create({ data: { name: "Referred", handle: `referred-${Date.now()}` } })).id;
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [referrer, referred] } } });
});

describe("referral attribution", () => {
  it("codes are stable, well-formed and unique per workspace", async () => {
    const code = await ensureReferralCode(referrer);
    expect(isReferralCode(code)).toBe(true);
    expect(await ensureReferralCode(referrer)).toBe(code);
    expect(new Set(Array.from({ length: 50 }, generateReferralCode)).size).toBe(50);
  });
  it("attributes a signup only to a real code, never to itself, and records the milestones once", async () => {
    const code = await ensureReferralCode(referrer);
    expect(await attributeReferral(referred, "nope", "abcdef123456")).toBeNull();
    expect(await attributeReferral(referred, "zzzzzzzz")).toBeNull();
    expect(await attributeReferral(referrer, code)).toBeNull();
    expect(await attributeReferral(referred, code, "abcdef123456")).toBe(referrer);
    expect((await prisma.business.findUnique({ where: { id: referred } }))?.referredById).toBe(referrer);
    const signup = await prisma.analyticsEvent.findFirst({ where: { businessId: referred, name: "referral_signup" } });
    expect((signup?.properties as { referrerBusinessId: string }).referrerBusinessId).toBe(referrer);
    expect(signup?.anonymousId).toBe("abcdef123456");

    await trackReferralMilestone(referred, "referral_activated", { provider: "EMAIL" });
    await trackReferralMilestone(referred, "referral_activated", { provider: "EMAIL" });
    await trackReferralMilestone(referrer, "referral_converted");
    expect(await prisma.analyticsEvent.count({ where: { businessId: referred, name: "referral_activated" } })).toBe(1);
    expect(await prisma.analyticsEvent.count({ where: { businessId: referrer, name: "referral_converted" } })).toBe(0);
  });
});
