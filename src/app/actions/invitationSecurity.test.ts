import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword, createSessionToken, verifySessionToken } from "@/lib/auth";

const ip = { value: "203.0.113.50" };
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": ip.value }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { acceptInvitation, resendInvitation } from "@/app/actions/invitations";
import { generateInvitationToken, invitationExpiry } from "@/lib/invitations";

/**
 * Accepting an invitation verifies a password, which makes it a login. Any signed-up owner
 * can mint an invitation for any address, so without a limit this was an unlimited
 * guessing oracle against any Daythread account, ending in a session as that person.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("invitation acceptance is a login and is throttled like one", () => {
  const ids: string[] = [];
  let businessId: string;
  let victimEmail: string;
  let token: string;

  beforeAll(async () => {
    const s = stamp();
    ip.value = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    const business = await prisma.business.create({ data: { name: "Attacker Co", handle: `att-${s}` } });
    businessId = business.id;
    ids.push(business.id);
    victimEmail = `victim-${s}@example.test`;
    await prisma.user.create({ data: { name: "Victim", email: victimEmail, passwordHash: await hashPassword("the-real-password-123") } });
    token = generateInvitationToken();
    await prisma.invitation.create({ data: { businessId: business.id, email: victimEmail, role: "CLIENT", token, expiresAt: invitationExpiry(), status: "PENDING" } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: "victim-" } } });
    await prisma.user.deleteMany({ where: { orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  it("stops guessing long before a password could be found, and never grants membership", async () => {
    const attempts: Array<{ error?: string } | undefined> = [];
    for (let i = 0; i < 12; i++) attempts.push(await acceptInvitation(token, form({ password: `guess-${i}` })));

    const wrong = attempts.filter((a) => a?.error === "Incorrect password.").length;
    const throttled = attempts.filter((a) => a?.error?.match(/too many attempts/i)).length;
    // The limit is 8 per token; everything after that is refused without touching the hash.
    expect(wrong).toBeLessThanOrEqual(8);
    expect(throttled).toBeGreaterThan(0);
    expect(wrong + throttled).toBe(12);

    // And no membership was created for the victim in the attacker's workspace.
    const victim = await prisma.user.findUniqueOrThrow({ where: { email: victimEmail } });
    expect(await prisma.orgMembership.count({ where: { userId: victim.id, businessId } })).toBe(0);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { token } })).status).toBe("PENDING");
  });
});

describe("resending an invitation cannot revive a dead link", () => {
  const ids: string[] = [];
  let ctx: { businessId: string; session: NonNullable<Awaited<ReturnType<typeof verifySessionToken>>> };

  beforeAll(async () => {
    const s = stamp();
    const business = await prisma.business.create({ data: { name: "Resend Co", handle: `res-${s}` } });
    ids.push(business.id);
    const user = await prisma.user.create({ data: { name: "Owner", email: `res-owner-${s}@example.test`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: user.id, businessId: business.id, role: "OWNER" } });
    ctx = { businessId: business.id, session: (await verifySessionToken(await createSessionToken({ userId: user.id, activeBusinessId: business.id })))! };
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  const make = (status: "PENDING" | "ACCEPTED" | "REVOKED") =>
    prisma.invitation.create({ data: { businessId: ctx.businessId, email: `inv-${stamp()}@example.test`, role: "CLIENT", token: generateInvitationToken(), expiresAt: invitationExpiry(), status } });

  it("a revoked or already-used invitation is refused, so a leaked link stays dead", async () => {
    for (const status of ["REVOKED", "ACCEPTED"] as const) {
      const inv = await make(status);
      const r = await resendInvitation(inv.id, ctx.session);
      expect(r.error).toBeTruthy();
      expect(r.link).toBeUndefined();
      const after = await prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } });
      expect(after.status).toBe(status);
      expect(after.token).toBe(inv.token);
    }
  });

  it("resending an outstanding invitation issues a new link and retires the old one", async () => {
    const inv = await make("PENDING");
    const r = await resendInvitation(inv.id, ctx.session);
    expect(r.error).toBeUndefined();
    const after = await prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.token).not.toBe(inv.token);
    expect(r.link).toContain(after.token);
    // The old link no longer resolves to anything.
    expect(await prisma.invitation.findUnique({ where: { token: inv.token } })).toBeNull();
  });
});
