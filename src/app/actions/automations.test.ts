import { describe, it, expect, afterAll, vi, beforeAll } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// The actions take an explicit session (the same way the agent and connect actions do), so
// a test can act as a specific workspace's owner.
const current = { session: null as { userId: string; activeBusinessId: string } | null };

/** Creating, editing and deleting automations: the Free cap decides whether a new one
 * starts switched on; edits and deletes never reach across workspaces; bad templates are
 * refused with the reason. */
describe("automation editor actions", () => {
  const ids: string[] = [];
  let create: typeof import("./automations").createAutomation;
  let update: typeof import("./automations").updateAutomation;
  let remove: typeof import("./automations").deleteAutomation;
  beforeAll(async () => ({ createAutomation: create, updateAutomation: update, deleteAutomation: remove } = await import("./automations")));
  async function workspace(planTier: "FREE" | "PRO") {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const b = await prisma.business.create({ data: { name: `Autos ${planTier}`, handle: `autos-${stamp}`, planTier, billingStatus: planTier === "FREE" ? null : "ACTIVE" } });
    const u = await prisma.user.create({ data: { name: "O", email: `autos-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: u.id, businessId: b.id, role: "OWNER" } });
    ids.push(b.id);
    return { businessId: b.id, session: { userId: u.id, activeBusinessId: b.id } };
  }
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });
  const base = { name: "Confirm", trigger: "BOOKING_CREATED" as const, action: "SEND_CONFIRMATION" as const, offsetHours: 0, messageTemplate: "Hi {{name}}, booked for {{date}}." };

  it("Free: the first three start on, the fourth is saved switched off with the reason", async () => {
    const w = await workspace("FREE");
    current.session = w.session;
    for (let i = 0; i < 3; i++) expect((await create({ ...base, name: `A${i}`, offsetHours: i }, current.session)).paused).toBeUndefined();
    const fourth = await create({ ...base, name: "A3", offsetHours: 3 }, current.session);
    expect(fourth.id).toBeTruthy();
    expect(fourth.paused).toMatch(/^Free runs 3 automations/);
    const rows = await prisma.automation.findMany({ where: { businessId: w.businessId }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.enabled)).toEqual([true, true, true, false]);
  });

  it("Pro: uncapped", async () => {
    const w = await workspace("PRO");
    current.session = w.session;
    for (let i = 0; i < 5; i++) expect((await create({ ...base, name: `P${i}`, offsetHours: i }, current.session)).paused).toBeUndefined();
  });

  it("refuses a copy of an automation that already exists — the same trigger, action and timing would message people twice", async () => {
    const w = await workspace("PRO");
    current.session = w.session;
    expect((await create({ ...base, name: "Confirm" }, current.session)).id).toBeTruthy();
    const copy = await create({ ...base, name: "Confirm again", messageTemplate: "Different words, same job." }, current.session);
    expect(copy.id).toBeUndefined();
    expect(copy.error).toMatch(/already have an automation that does this \(“Confirm”\)/);
    expect(await prisma.automation.count({ where: { businessId: w.businessId } })).toBe(1);
    // A different timing is a different automation.
    expect((await create({ ...base, name: "Confirm later", offsetHours: 2 }, current.session)).id).toBeTruthy();
  });

  it("refuses an unknown variable and an empty message", async () => {
    const w = await workspace("PRO");
    current.session = w.session;
    expect((await create({ ...base, messageTemplate: "Hi {{firstname}}" }, current.session)).error).toMatch(/Only these variables/);
    expect((await create({ ...base, messageTemplate: "" }, current.session)).error).toBeTruthy();
  });

  it("edits and deletes stay inside the workspace", async () => {
    const a = await workspace("PRO");
    const b = await workspace("PRO");
    current.session = a.session;
    const { id } = await create(base, current.session);
    current.session = b.session;
    expect((await update(id!, { ...base, name: "Hijacked" }, current.session)).error).toMatch(/doesn't exist/);
    expect((await remove(id!, current.session)).error).toMatch(/doesn't exist/);
    expect((await prisma.automation.findUnique({ where: { id: id! } }))?.name).toBe("Confirm");
    current.session = a.session;
    expect((await update(id!, { ...base, name: "Renamed", offsetHours: 24 }, current.session)).error).toBeUndefined();
    expect((await prisma.automation.findUnique({ where: { id: id! } }))?.name).toBe("Renamed");
    expect((await remove(id!, current.session)).error).toBeUndefined();
    expect(await prisma.automation.findUnique({ where: { id: id! } })).toBeNull();
  });
});
