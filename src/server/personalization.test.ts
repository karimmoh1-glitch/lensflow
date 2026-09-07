import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { savePersonalization, getPersonalization, parseAnswers } from "./personalization";
import type { OnboardingAnswers } from "@/lib/personalization";

const answers: OnboardingAnswers = {
  userType: "business_owner", workCategory: "beauty_wellness", businessStatus: "business", teamSize: "just_me",
  channels: ["instagram", "whatsapp", "email"], painPoints: ["messages", "follow_ups"], desiredFeatures: ["inbox", "bookings", "agent"],
  currentTools: ["instagram", "google_calendar"], bookings: "yes", teamUsage: "no",
};

let businessId: string;
beforeAll(async () => {
  const b = await prisma.business.create({ data: { name: "Personalization fixture", handle: `personalization-${Date.now()}` } });
  businessId = b.id;
});
afterAll(async () => {
  await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
});

describe("savePersonalization", () => {
  it("writes exactly what 'Building your Daythread' says: profile, priorities, wanted channels, recommendation", async () => {
    const p = await savePersonalization(businessId, answers, { selectedPlan: "PRO", anonymousId: "abcdef123456", source: "signup" });
    expect(p.recommendedPlan).toBe("PRO");

    const profile = await prisma.onboardingProfile.findUnique({ where: { businessId } });
    expect(profile?.recommendedPlan).toBe("PRO");
    expect(profile?.selectedPlan).toBe("PRO");
    expect(profile?.channels).toEqual(["instagram", "whatsapp", "email"]);

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    expect(business?.priorities).toEqual(p.priorities);
    expect(business?.priorities[0]).toBe("inbox");
    expect(business?.priorities).toContain("bookings");

    const wanted = await prisma.integration.findMany({ where: { businessId, wanted: true }, select: { provider: true, status: true } });
    expect(wanted.map((w) => w.provider).sort()).toEqual(["EMAIL", "GOOGLE_CALENDAR", "INSTAGRAM", "WHATSAPP"]);
    // Marked wanted, never connected: no credential, no status change.
    expect(wanted.every((w) => w.status === "NOT_CONNECTED")).toBe(true);
    expect(await prisma.integration.count({ where: { businessId, provider: "SMS" } })).toBe(0);

    const events = await prisma.analyticsEvent.findMany({ where: { businessId, name: "personalization_created" } });
    expect(events).toHaveLength(1);
    expect(events[0].anonymousId).toBe("abcdef123456");
    const props = events[0].properties as Record<string, unknown>;
    expect(props.recommendedPlan).toBe("PRO");
    expect(props.selectedPlan).toBe("PRO");
    expect(props.source).toBe("signup");
    // Option keys and plan keys only — nothing a person typed.
    expect(JSON.stringify(props)).not.toMatch(/@|password/i);
  });

  it("reads back re-derived, and an update keeps the plan choice unless told otherwise", async () => {
    const stored = await getPersonalization(businessId);
    expect(stored?.recommendedPlan).toBe("PRO");
    expect(stored?.selectedPlan).toBe("PRO");
    expect(stored?.usesBookings).toBe(true);
    expect(stored?.connectProviders).toEqual(["INSTAGRAM", "WHATSAPP", "EMAIL", "GOOGLE_CALENDAR"]);

    const p2 = await savePersonalization(businessId, { ...answers, channels: ["email"], currentTools: ["gmail"], desiredFeatures: ["inbox"], bookings: "no" }, { source: "settings" });
    expect(p2.recommendedPlan).toBe("FREE");
    const after = await getPersonalization(businessId);
    expect(after?.recommendedPlan).toBe("FREE");
    expect(after?.selectedPlan).toBe("PRO");
    expect(after?.priorities).not.toContain("bookings");
    expect((await prisma.business.findUnique({ where: { id: businessId } }))?.priorities).toEqual(after?.priorities);
    const updated = await prisma.analyticsEvent.count({ where: { businessId, name: "personalization_updated" } });
    expect(updated).toBe(1);
  });

  it("parseAnswers accepts only the real shape and refuses oversized or malformed input", () => {
    expect(parseAnswers(JSON.stringify(answers))).toEqual(answers);
    expect(parseAnswers("{not json")).toBeNull();
    expect(parseAnswers(JSON.stringify({ ...answers, channels: ["carrier_pigeon"] }))).toBeNull();
    expect(parseAnswers("x".repeat(4001))).toBeNull();
    expect(parseAnswers(null)).toBeNull();
  });
});
