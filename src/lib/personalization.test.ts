import { describe, it, expect } from "vitest";
import { derivePersonalization, answersSchema, asksTeamSize, personalPaywallCopy, buildSteps, PRIORITY_COPY, type OnboardingAnswers } from "./personalization";

const base: OnboardingAnswers = {
  userType: "freelancer", workCategory: "design", businessStatus: "solo", channels: ["email"], painPoints: ["customer_info"],
  desiredFeatures: ["inbox", "people"], currentTools: ["gmail"], bookings: "no", teamUsage: "no",
};

describe("personalization engine", () => {
  it("Persona A — solo freelancer on email, no bookings, wants organization → Free", () => {
    const p = derivePersonalization(base);
    expect(p.recommendedPlan).toBe("FREE");
    expect(p.isBusiness).toBe(true);
    expect(p.usesBookings).toBe(false);
    expect(p.usesTeam).toBe(false);
    expect(p.priorities[0]).toBe("inbox");
    expect(p.priorities).toContain("people");
    expect(p.priorities).not.toContain("bookings");
    expect(p.connectProviders).toEqual(["EMAIL"]);
    expect(p.reasons.join(" ")).toMatch(/Free covers/);
  });

  it("Persona B — small business on Instagram + WhatsApp + email, bookings, AI, automations → Pro", () => {
    const p = derivePersonalization({
      ...base, userType: "business_owner", workCategory: "beauty_wellness", businessStatus: "business", teamSize: "just_me",
      channels: ["instagram", "whatsapp", "email"], painPoints: ["messages", "follow_ups", "bookings"],
      desiredFeatures: ["inbox", "bookings", "agent", "automations"], currentTools: ["instagram", "whatsapp", "gmail"], bookings: "yes", teamUsage: "no",
    });
    expect(p.recommendedPlan).toBe("PRO");
    expect(p.channelCount).toBe(3);
    expect(p.connectProviders).toEqual(["INSTAGRAM", "WHATSAPP", "EMAIL"]);
    expect(p.reasons[0]).toMatch(/Instagram, WhatsApp and Email/);
    expect(p.reasons.join(" ")).toMatch(/AI help/);
    expect(p.reasons.join(" ")).toMatch(/Unlimited automations/);
    expect(p.priorities.slice(0, 2)).toEqual(["inbox", "bookings"]);
    expect(p.priorities).toContain("automations");
    expect(p.priorities).toContain("agent");
    expect(p.priorities).not.toContain("team");
  });

  it("Persona C — team business, many channels, team workflows → Business", () => {
    const p = derivePersonalization({
      ...base, userType: "agency", workCategory: "marketing", businessStatus: "team", teamSize: "6_10",
      channels: ["email", "instagram", "whatsapp", "sms", "website"], painPoints: ["team", "one_place", "follow_ups"],
      desiredFeatures: ["inbox", "team", "agent", "automations"], currentTools: ["multiple", "crm"], bookings: "sometimes", teamUsage: "regularly",
    });
    expect(p.recommendedPlan).toBe("BUSINESS");
    expect(p.seatsNeeded).toBe(10);
    expect(p.reasons[0]).toMatch(/Six to ten people/);
    expect(p.priorities[0]).toBe("inbox");
    expect(p.priorities).toContain("team");
    expect(p.priorities.length).toBeLessThanOrEqual(4);
    expect(personalPaywallCopy(p, "BUSINESS")?.title).toBe("Business fits your team.");
  });

  it("Persona D — personal use, minimal needs → Free, and never Pro however many channels", () => {
    const p = derivePersonalization({ ...base, userType: "other", businessStatus: "personal", channels: ["email", "whatsapp", "sms"], painPoints: ["one_place"], desiredFeatures: ["calendar"], currentTools: ["nothing"], bookings: "no", teamUsage: "no" });
    expect(p.recommendedPlan).toBe("FREE");
    expect(p.isBusiness).toBe(false);
    expect(p.reasons[0]).toMatch(/for yourself/);
    expect(p.priorities.length).toBeGreaterThanOrEqual(2);
    expect(p.priorities).toEqual(["inbox", "calendar"]);
    expect(personalPaywallCopy(p, "BUSINESS")).toBeNull();
  });

  it("the four personas get genuinely different priorities", () => {
    const A = derivePersonalization(base).priorities.join(",");
    const B = derivePersonalization({ ...base, channels: ["instagram", "whatsapp", "email"], desiredFeatures: ["bookings", "agent", "automations"], bookings: "yes" }).priorities.join(",");
    const C = derivePersonalization({ ...base, businessStatus: "team", teamSize: "6_10", teamUsage: "regularly", desiredFeatures: ["team", "agent"], painPoints: ["team"] }).priorities.join(",");
    const D = derivePersonalization({ ...base, businessStatus: "personal", desiredFeatures: ["calendar"], painPoints: [] }).priorities.join(",");
    expect(new Set([A, B, C, D]).size).toBe(4);
  });

  it("each Pro trigger stands on its own and names its reason", () => {
    expect(derivePersonalization({ ...base, channels: ["email", "instagram", "whatsapp"] }).reasons[0]).toMatch(/Free connects two/);
    expect(derivePersonalization({ ...base, channels: ["sms"] }).reasons[0]).toMatch(/own number/);
    expect(derivePersonalization({ ...base, desiredFeatures: ["agent"] }).reasons[0]).toMatch(/AI help/);
    expect(derivePersonalization({ ...base, teamUsage: "occasionally", teamSize: "2_5" }).reasons[0]).toMatch(/five people/);
    for (const a of [{ ...base, channels: ["email", "instagram"] as OnboardingAnswers["channels"] }, { ...base, desiredFeatures: ["automations"] as OnboardingAnswers["desiredFeatures"] }, { ...base, bookings: "yes" as const }]) {
      expect(derivePersonalization(a).recommendedPlan).toBe("FREE");
    }
  });

  it("two channels plus Google Calendar is three connections → Pro; the website form is not a connection", () => {
    expect(derivePersonalization({ ...base, channels: ["email", "instagram"], currentTools: ["google_calendar"] }).recommendedPlan).toBe("PRO");
    expect(derivePersonalization({ ...base, channels: ["email", "instagram", "website", "other"], currentTools: [] }).recommendedPlan).toBe("FREE");
  });

  it("more than five seats means Business even when nothing else is asked for", () => {
    const p = derivePersonalization({ ...base, businessStatus: "business", teamSize: "11_plus", teamUsage: "regularly" });
    expect(p.recommendedPlan).toBe("BUSINESS");
    expect(p.reasons[0]).toMatch(/More than ten/);
  });

  it("team size only counts when someone else is involved", () => {
    expect(asksTeamSize({ businessStatus: "solo", teamUsage: "no" })).toBe(false);
    expect(asksTeamSize({ businessStatus: "solo", teamUsage: "occasionally" })).toBe(true);
    expect(asksTeamSize({ businessStatus: "business", teamUsage: "no" })).toBe(true);
    const p = derivePersonalization({ ...base, businessStatus: "solo", teamUsage: "no", teamSize: "6_10" });
    expect(p.teamSize).toBe("just_me");
    expect(p.recommendedPlan).toBe("FREE");
  });

  it("the personal paywall only says what they said", () => {
    const p = derivePersonalization({ ...base, channels: ["instagram", "email", "sms"], desiredFeatures: ["agent"] });
    const c = personalPaywallCopy(p, "PRO");
    expect(c?.title).toBe("Pro fits the way you work.");
    expect(c?.lede).toBe("You're managing customers across Instagram, Email and SMS and you want AI-assisted replies and texting from your own number. Pro unlocks the tools you selected during setup.");
    expect(personalPaywallCopy(derivePersonalization(base), "PRO")).toBeNull();
    const only = personalPaywallCopy(derivePersonalization({ ...base, desiredFeatures: ["automations"] }), "PRO");
    expect(only?.lede).toBe("You want automations. Pro unlocks the tools you selected during setup.");
  });

  it("build steps describe real writes only", () => {
    const steps = buildSteps(derivePersonalization({ ...base, channels: ["instagram"], currentTools: [] }));
    expect(steps).toEqual(["Saving how you work", "Ordering your workspace: Inbox and People", "Marking Instagram to connect", "Noting the plan that fits: Free"]);
    const none = buildSteps(derivePersonalization({ ...base, channels: ["website"], currentTools: ["nothing"] }));
    expect(none.some((s) => s.startsWith("Marking"))).toBe(false);
  });

  it("the schema refuses unknown options and free text beyond the work detail", () => {
    expect(answersSchema.safeParse({ ...base, channels: ["telegram"] }).success).toBe(false);
    expect(answersSchema.safeParse({ ...base, workDetail: "x".repeat(81) }).success).toBe(false);
    expect(answersSchema.safeParse({ ...base, workCategory: "other", workDetail: "Dog grooming" }).success).toBe(true);
    expect(answersSchema.safeParse({ ...base, extra: "ignored" }).success).toBe(true);
  });

  it("files rank for the businesses that finish a job by handing something over", () => {
    // A consultant delivering reports and a photographer delivering galleries are the same
    // shape of business here: the answers decide, not the trade.
    const consultant = derivePersonalization({
      ...base, userType: "business_owner", workCategory: "consulting",
      painPoints: ["delivery", "customer_info"], desiredFeatures: ["inbox", "files"], currentTools: ["google_drive"],
    });
    expect(consultant.priorities).toContain("files");
    expect(consultant.connectProviders).toContain("GOOGLE_DRIVE");

    const photographer = derivePersonalization({
      ...base, workCategory: "photography", painPoints: ["delivery"], desiredFeatures: ["files"], currentTools: ["dropbox"],
    });
    expect(photographer.priorities).toContain("files");
    expect(photographer.connectProviders).toContain("DROPBOX");
  });

  it("files stay out of the way for a business that never hands work over", () => {
    const p = derivePersonalization({ ...base, painPoints: ["messages"], desiredFeatures: ["inbox"], currentTools: ["gmail"] });
    expect(p.priorities).not.toContain("files");
    expect(p.connectProviders).not.toContain("GOOGLE_DRIVE");
    expect(p.connectProviders).not.toContain("DROPBOX");
  });

  it("keeps every priority nameable on the Today card", () => {
    // A feature added without copy would render a blank card, which is how the last one
    // would have shipped broken.
    const everything = derivePersonalization({
      ...base, channels: ["email", "instagram", "whatsapp", "sms"],
      painPoints: ["messages", "follow_ups", "delivery", "team", "customer_info"],
      desiredFeatures: ["inbox", "bookings", "automations", "agent", "team", "people", "files"],
      currentTools: ["gmail", "google_drive"], bookings: "yes", teamUsage: "regularly",
    });
    for (const f of everything.priorities) {
      expect(PRIORITY_COPY[f]?.title, f).toBeTruthy();
      expect(PRIORITY_COPY[f]?.href.startsWith("/dashboard"), f).toBe(true);
    }
    expect(buildSteps(everything).join(" ")).not.toContain("undefined");
  });
});
