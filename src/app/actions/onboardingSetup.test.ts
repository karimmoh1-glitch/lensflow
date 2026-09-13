import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";

const current = vi.hoisted(() => ({ session: null as null | { userId: string; activeBusinessId: string } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.40" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@/lib/auth", async (importOriginal) => { const mod = await importOriginal<typeof import("@/lib/auth")>(); return { ...mod, getSession: async () => current.session }; });

import { turnOnStarterAutomations, completeOnboarding } from "@/app/actions/onboarding";
import { setupSteps } from "@/server/setupSteps";
import { savePersonalization } from "@/server/personalization";

/**
 * The first five minutes: onboarding's automation step switches on real automations through
 * the same plan-limited, tenant-scoped path as the Automations page, finishing lands on
 * Today, and Today's checklist only ticks what the database shows is done.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const businesses: string[] = [];
const users: string[] = [];

async function workspace(role: "OWNER" | "ADMIN" | "PHOTOGRAPHER" | "PARTNER" = "OWNER") {
  const s = stamp();
  const biz = await prisma.business.create({ data: { name: `Setup ${s}`, handle: `setup-${s}` } });
  const user = await prisma.user.create({ data: { name: "Owner", email: `setup-${s}@example.test`, passwordHash: "x" } });
  businesses.push(biz.id);
  users.push(user.id);
  await prisma.orgMembership.create({ data: { userId: user.id, businessId: biz.id, role } });
  current.session = { userId: user.id, activeBusinessId: biz.id };
  return { businessId: biz.id, userId: user.id };
}

afterEach(() => { current.session = null; });
const sess = () => current.session as never;
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: businesses } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe("onboarding automation step", () => {
  it("switches on the chosen recipes, once, and ignores anything that isn't a starter recipe", async () => {
    const { businessId } = await workspace();
    const first = await turnOnStarterAutomations(["confirm", "remind", "quiet", "drop table"], sess());
    expect(first).toEqual({ ok: true, created: 2, existing: 0, paused: null });
    const rows = await prisma.automation.findMany({ where: { businessId }, orderBy: { action: "asc" } });
    expect(rows.map((r) => [r.action, r.enabled])).toEqual([["SEND_CONFIRMATION", true], ["SEND_REMINDER", true]]);

    const again = await turnOnStarterAutomations(["confirm", "remind", "thanks"], sess());
    expect(again).toEqual({ ok: true, created: 1, existing: 2, paused: null });
    expect(await prisma.automation.count({ where: { businessId } })).toBe(3);

    expect(await turnOnStarterAutomations("confirm", sess())).toEqual({ ok: true, created: 0, existing: 0, paused: null });
  });

  it("respects Free's automation limit: saved switched off, with the reason", async () => {
    const { businessId } = await workspace();
    for (const i of [1, 2, 3]) {
      await prisma.automation.create({ data: { businessId, name: `Existing ${i}`, trigger: "LEAD_INACTIVE", action: "SEND_FOLLOW_UP", offsetHours: 100 + i, messageTemplate: "Hi {{name}}", enabled: true } });
    }
    const result = await turnOnStarterAutomations(["confirm"], sess());
    expect(result.ok && result.created).toBe(1);
    expect(result.ok && result.paused).toMatch(/3 automations at once/);
    const confirm = await prisma.automation.findFirstOrThrow({ where: { businessId, action: "SEND_CONFIRMATION" } });
    expect(confirm.enabled).toBe(false);
  });

  it("is refused to roles that can't set up the workspace, and never writes to another one", async () => {
    const other = await workspace();
    const { businessId } = await workspace("PARTNER");
    expect(await turnOnStarterAutomations(["confirm"], sess())).toEqual({ ok: false, error: "Only an owner or admin can set this up." });
    expect(await prisma.automation.count({ where: { businessId: { in: [businessId, other.businessId] } } })).toBe(0);
  });

  it("finishing marks the workspace ready and opens Today", async () => {
    const { businessId } = await workspace();
    await expect(completeOnboarding({ timezone: "America/Chicago" }, sess())).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(b.onboardingComplete).toBe(true);
    expect(b.timezone).toBe("America/Chicago");
  });
});

describe("Today's setup checklist", () => {
  it("ticks only what the records show, and adds the team step only for people who work with others", async () => {
    const { businessId } = await workspace();
    let steps = await setupSteps(businessId);
    expect(steps.map((s) => [s.key, s.done])).toEqual([["channel", false], ["services", false], ["calendar", false], ["confirm", false]]);

    // A wanted-but-unconnected channel names the provider; it isn't counted as done.
    await savePersonalization(businessId, { userType: "business_owner", workCategory: "photography", businessStatus: "team", teamSize: "2_5", channels: ["instagram"], painPoints: ["bookings"], desiredFeatures: ["inbox", "team"], currentTools: [], bookings: "yes", teamUsage: "regularly" }, { source: "signup" });
    steps = await setupSteps(businessId);
    expect(steps.find((s) => s.key === "channel")).toMatchObject({ title: "Connect Instagram", done: false });
    expect(steps.find((s) => s.key === "team")).toMatchObject({ done: false });

    // A service without hours is not bookable yet; a disabled confirmation doesn't count.
    await prisma.service.create({ data: { businessId, name: "Portrait", priceCents: 20000 } });
    await prisma.automation.create({ data: { businessId, name: "Confirm", trigger: "BOOKING_CREATED", action: "SEND_CONFIRMATION", offsetHours: 0, messageTemplate: "Booked", enabled: false } });
    steps = await setupSteps(businessId);
    expect(steps.find((s) => s.key === "services")).toMatchObject({ title: "Add your working hours", done: false });
    expect(steps.find((s) => s.key === "confirm")?.done).toBe(false);

    await prisma.availability.create({ data: { businessId, weekday: 2, startMin: 540, endMin: 1020 } });
    await prisma.automation.updateMany({ where: { businessId }, data: { enabled: true } });
    await prisma.integration.update({ where: { businessId_provider: { businessId, provider: "INSTAGRAM" } }, data: { status: "CONNECTED" } });
    await prisma.integration.create({ data: { businessId, provider: "GOOGLE_CALENDAR", status: "NEEDS_ATTENTION" } }).catch(async () => prisma.integration.update({ where: { businessId_provider: { businessId, provider: "GOOGLE_CALENDAR" } }, data: { status: "NEEDS_ATTENTION" } }));
    const u = await prisma.user.create({ data: { name: "Second", email: `second-${stamp()}@example.test`, passwordHash: "x" } });
    users.push(u.id);
    await prisma.orgMembership.create({ data: { userId: u.id, businessId, role: "PHOTOGRAPHER" } });
    steps = await setupSteps(businessId);
    expect(steps.every((s) => s.done)).toBe(true);
  });

  it("never counts another workspace's records", async () => {
    const mine = await workspace();
    const theirs = await workspace();
    await prisma.service.create({ data: { businessId: theirs.businessId, name: "Theirs", priceCents: 100 } });
    await prisma.availability.create({ data: { businessId: theirs.businessId, weekday: 1, startMin: 0, endMin: 60 } });
    await prisma.integration.create({ data: { businessId: theirs.businessId, provider: "EMAIL", status: "CONNECTED" } });
    const steps = await setupSteps(mine.businessId);
    expect(steps.some((s) => s.done)).toBe(false);
  });
});
