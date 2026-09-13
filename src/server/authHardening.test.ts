import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-vercel-forwarded-for": `192.0.2.${Math.floor(Math.random() * 250) + 1}` }),
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined), set: (k: string, v: string) => { jar.set(k, v); }, delete: (k: string) => { jar.delete(k); } }),
}));

import { sharedRateLimit } from "@/lib/sharedRateLimit";
import { login, forgotPassword, resetPassword, logout } from "@/app/actions/auth";
import { hashPassword, createSessionToken, verifySessionToken } from "@/lib/auth";
import { hashResetToken } from "@/lib/passwordReset";
import { updateBusinessProfile, saveServices } from "@/app/actions/settings";
import { inviteClient } from "@/app/actions/invitations";

/** What an attacker would try against sign-in, reset, invitations and settings writes. */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("auth hardening", () => {
  const users: string[] = [];
  const businesses: string[] = [];
  let owner: { userId: string; businessId: string; email: string; session: { userId: string; activeBusinessId: string } };

  beforeAll(async () => {
    const s = stamp();
    const email = `hardening-${s}@example.test`;
    const biz = await prisma.business.create({ data: { name: "Hardening", handle: `hardening-${s}` } });
    const user = await prisma.user.create({ data: { name: "Owner", email, passwordHash: await hashPassword("correct-horse-battery") } });
    await prisma.orgMembership.create({ data: { userId: user.id, businessId: biz.id, role: "OWNER" } });
    users.push(user.id);
    businesses.push(biz.id);
    owner = { userId: user.id, businessId: biz.id, email, session: { userId: user.id, activeBusinessId: biz.id } };
  });
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businesses } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it("the shared limiter counts across calls the way separate instances would see it, and stores no raw key", async () => {
    const key = `test:${stamp()}@example.test`;
    for (let i = 0; i < 3; i++) expect((await sharedRateLimit(key, { limit: 3, windowMs: 60_000 })).ok).toBe(true);
    expect((await sharedRateLimit(key, { limit: 3, windowMs: 60_000 })).ok).toBe(false);
    expect(await prisma.rateLimitHit.count({ where: { key } })).toBe(0);
  });

  it("password guesses against one account share one budget across web and mobile sign-in", async () => {
    // Eight on the web (the per-instance brake allows eight)...
    for (let i = 0; i < 8; i++) {
      const r = await login(form({ email: owner.email.toUpperCase(), password: `wrong-${i}` }));
      expect(r?.error).toMatch(/incorrect/i);
    }
    // ...two more on mobile, which has its own per-instance brake but the same shared account budget...
    const { POST } = await import("@/app/api/mobile/auth/login/route");
    const attempt = (password: string) => POST(new Request("http://localhost/api/mobile/auth/login", { method: "POST", body: JSON.stringify({ email: owner.email, password }) }));
    expect((await attempt("wrong-8")).status).toBe(401);
    expect((await attempt("wrong-9")).status).toBe(401);
    // ...and now even the right password waits, whichever door it comes through.
    expect((await attempt("correct-horse-battery")).status).toBe(429);
  });

  it("an unknown address takes as long to refuse as a wrong password", async () => {
    const t1 = Date.now();
    await login(form({ email: `nobody-${stamp()}@example.test`, password: "whatever-1" }));
    const unknownMs = Date.now() - t1;
    expect(unknownMs).toBeGreaterThan(40);
  });

  it("reset tokens are stored hashed, work once, prove the address, and sign every session out", async () => {
    const s = stamp();
    const email = `reset-${s}@example.test`;
    const user = await prisma.user.create({ data: { name: "Reset", email, passwordHash: await hashPassword("old-password-1") } });
    users.push(user.id);
    const oldToken = await createSessionToken({ userId: user.id });
    const raw = `raw-token-${s}`;
    await prisma.passwordResetToken.create({ data: { userId: user.id, token: hashResetToken(raw), expiresAt: new Date(Date.now() + 3600_000) } });
    expect(await prisma.passwordResetToken.count({ where: { token: raw } })).toBe(0);
    await expect(resetPassword(raw, form({ password: "new-password-1" }))).rejects.toThrow(/NEXT_REDIRECT:\/login/);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(await verifySessionToken(oldToken)).toBeNull();
    expect((await resetPassword(raw, form({ password: "another-pass-1" })))?.error).toMatch(/invalid|expired/i);
    // Asking for a reset never stores the token that goes out.
    await forgotPassword(form({ email }));
    const rows = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(rows.every((r) => r.token.length === 43)).toBe(true);
  });

  it("signing out revokes the token everywhere, not just in this browser", async () => {
    const s = stamp();
    const user = await prisma.user.create({ data: { name: "Leaver", email: `leaver-${s}@example.test`, passwordHash: "x" } });
    users.push(user.id);
    const token = await createSessionToken({ userId: user.id });
    jar.set("lf_session", token);
    await expect(logout()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("the business profile writes only its five fields: no plan, no memberships, no other workspace's rows", async () => {
    const hostile = { name: "Renamed", bio: "", timezone: "America/New_York", bufferMinutes: 10, bookingLeadHours: 2, compedPlan: "BUSINESS", planTier: "BUSINESS", orgMemberships: { deleteMany: {} } };
    await expect(updateBusinessProfile(hostile as never, owner.session)).rejects.toThrow();
    const row = await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } });
    expect(row.compedPlan).toBeNull();
    expect(row.planTier).toBe("FREE");
    expect(await prisma.orgMembership.count({ where: { businessId: owner.businessId } })).toBe(1);
    await updateBusinessProfile({ name: "Renamed", bio: "", timezone: "America/New_York", bufferMinutes: 10, bookingLeadHours: 2 }, owner.session);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } })).name).toBe("Renamed");
    await expect(updateBusinessProfile({ name: "X", bio: "", timezone: "Mars/Olympus", bufferMinutes: 0, bookingLeadHours: 0 }, owner.session)).rejects.toThrow(/timezone/i);
    await expect(saveServices([{ name: "A".repeat(500), priceCents: 100, durationMins: 30 }], owner.session)).rejects.toThrow();
  });

  it("invitations store the address lower-case, so a differently-cased duplicate account can't be made", async () => {
    const s = stamp();
    const r = await inviteClient(form({ name: "Mixed", email: `Mixed.Case-${s}@Example.TEST` }), owner.session);
    expect(r.error).toBeUndefined();
    const inv = await prisma.invitation.findFirstOrThrow({ where: { businessId: owner.businessId }, orderBy: { createdAt: "desc" } });
    expect(inv.email).toBe(`mixed.case-${s}@example.test`);
  });
});
