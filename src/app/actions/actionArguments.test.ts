import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";

const current = vi.hoisted(() => ({ session: null as null | { userId: string; activeBusinessId: string } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 20}` }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@/lib/auth", async (importOriginal) => { const mod = await importOriginal<typeof import("@/lib/auth")>(); return { ...mod, getSession: async () => current.session }; });

import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from "@/lib/auth";
import { changePassword } from "@/app/actions/settings";
import { toggleAutomation, deleteAutomation } from "@/app/actions/automations";
import { listJoinRequests } from "@/app/actions/joinRequests";
import { addClientNote } from "@/app/actions/clients";
import { isId } from "@/lib/ids";

/**
 * Server actions are public POST endpoints: an attacker chooses every argument. Two
 * classes of argument that used to be trusted:
 *
 *   - a `session` object posted as an argument, which changePassword honoured as-is —
 *     anyone could change anyone's password with a correct guess at the current one;
 *   - an "id" that is an object rather than a string, which Prisma reads as a filter —
 *     `toggleAutomation({ not: "" }, true)` switched on every automation in the workspace,
 *     past the Free plan's cap.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const businesses: string[] = [];
const users: string[] = [];

async function workspace() {
  const s = stamp();
  const biz = await prisma.business.create({ data: { name: `Args ${s}`, handle: `args-${s}` } });
  const user = await prisma.user.create({ data: { name: "Owner", email: `args-${s}@example.test`, passwordHash: await hashPassword("original-pass-1") } });
  businesses.push(biz.id);
  users.push(user.id);
  await prisma.orgMembership.create({ data: { userId: user.id, businessId: biz.id, role: "OWNER" } });
  return { businessId: biz.id, userId: user.id, email: user.email };
}

beforeAll(() => { vi.stubEnv("DAYTHREAD_STRICT_SESSIONS", "1"); });
afterEach(() => { current.session = null; });
afterAll(async () => {
  vi.unstubAllEnvs();
  await prisma.business.deleteMany({ where: { id: { in: businesses } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe("a posted session object is never honoured", () => {
  it("changePassword refuses a plain { userId } argument and leaves the password alone", async () => {
    const victim = await workspace();
    current.session = null; // nobody is signed in
    await expect(changePassword({ current: "original-pass-1", next: "attacker-chosen-9" }, { userId: victim.userId, activeBusinessId: victim.businessId })).rejects.toThrow("unauthorized");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: victim.userId } });
    expect(await verifyPassword("original-pass-1", row.passwordHash)).toBe(true);
    expect(row.sessionVersion).toBe(0);
  });

  it("changePassword still works for a session this server verified, and revokes the others", async () => {
    const me = await workspace();
    const verified = await verifySessionToken(await createSessionToken({ userId: me.userId, activeBusinessId: me.businessId }));
    expect(verified).not.toBeNull();
    const r = await changePassword({ current: "original-pass-1", next: "my-new-password-2" }, verified);
    expect(r).toEqual({ ok: true });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: me.userId } });
    expect(await verifyPassword("my-new-password-2", row.passwordHash)).toBe(true);
    expect(row.sessionVersion).toBe(1);
  });

  it("current-password guesses through changePassword draw on the account's shared login budget", async () => {
    const me = await workspace();
    const verified = await verifySessionToken(await createSessionToken({ userId: me.userId, activeBusinessId: me.businessId }));
    let throttled = false;
    for (let i = 0; i < 12; i++) {
      const r = await changePassword({ current: `wrong-${i}`, next: "whatever-new-1" }, verified);
      if (/too many/i.test(r.error ?? "")) { throttled = true; break; }
      expect(r.error).toMatch(/isn't right/);
    }
    expect(throttled).toBe(true);
  });
});

describe("ids must be strings", () => {
  it("an object where an id belongs is refused before any query runs", async () => {
    const { businessId, userId } = await workspace();
    current.session = { userId, activeBusinessId: businessId };
    const verified = await verifySessionToken(await createSessionToken({ userId, activeBusinessId: businessId }));
    for (const i of [1, 2, 3]) {
      await prisma.automation.create({ data: { businessId, name: `A${i}`, trigger: "LEAD_INACTIVE", action: "SEND_FOLLOW_UP", offsetHours: 100 + i, messageTemplate: "Hi {{name}}", enabled: false } });
    }
    await expect(toggleAutomation({ not: "" } as never, true, verified)).rejects.toThrow("invalid id");
    expect(await prisma.automation.count({ where: { businessId, enabled: true } })).toBe(0);
    await expect(deleteAutomation({ not: "" } as never, verified)).rejects.toThrow("invalid id");
    expect(await prisma.automation.count({ where: { businessId } })).toBe(3);
    await expect(addClientNote({ in: [] } as never, "hello", verified)).rejects.toThrow("invalid id");
  });

  it("accepts every id shape Daythread issues and rejects filters", () => {
    for (const ok of ["cmtzmc5pn00255xs16s9zh0eo", "C0123ABC", "+15125550148", "alex@icloud.com", "sub_1ABC", "a1b2c3d4e5f6"]) expect(isId(ok), ok).toBe(true);
    for (const bad of [{ not: "" }, ["x"], 12, null, undefined, "", "x".repeat(129), "a b", "a/b", "{}"]) expect(isId(bad), String(bad)).toBe(false);
  });
});

describe("what actions hand back", () => {
  it("listJoinRequests never returns a password hash", async () => {
    const { businessId, userId } = await workspace();
    const requester = await prisma.user.create({ data: { name: "Asker", email: `asker-${stamp()}@example.test`, passwordHash: await hashPassword("secret-pass-1") } });
    users.push(requester.id);
    await prisma.joinRequest.create({ data: { businessId, userId: requester.id, status: "PENDING" } });
    const verified = await verifySessionToken(await createSessionToken({ userId, activeBusinessId: businessId }));
    const rows = await listJoinRequests(verified);
    expect(rows).toHaveLength(1);
    expect(rows[0].user).toEqual({ id: requester.id, name: "Asker", email: requester.email });
    expect(JSON.stringify(rows)).not.toMatch(/\$2a\$|passwordHash|sessionVersion/);
  });
});
