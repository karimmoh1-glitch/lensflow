import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";

const jar = vi.hoisted(() => new Map<string, string>());
const live = vi.hoisted(() => ({ email: true }));
const sent = vi.hoisted(() => [] as Array<{ to: string | null; subject?: string; body: string }>);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 20}` }),
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined), set: (k: string, v: string) => { jar.set(k, v); }, delete: (k: string) => { jar.delete(k); } }),
}));
vi.mock("@/lib/messaging", async (orig) => ({
  ...(await orig<typeof import("@/lib/messaging")>()),
  messagingIsLive: () => live.email,
  sendOnChannel: async (p: { to: string | null; subject?: string; body: string }) => { sent.push(p); return { ok: true, simulated: false } as never; },
}));

import { signup, verifyEmail, resetPassword, resendVerification } from "@/app/actions/auth";
import { inviteClient, inviteTeammate, acceptInvitation } from "@/app/actions/invitations";
import { hashVerificationToken, consumeEmailVerification, EMAIL_VERIFICATION_PURPOSE } from "@/server/emailVerification";
import { hashResetToken, generatePasswordResetToken } from "@/lib/passwordReset";
import { addressProven } from "@/lib/founder";
import { generateInvitationToken, invitationExpiry } from "@/lib/invitations";
import { verifySessionToken, createSessionToken, hashPassword } from "@/lib/auth";

/**
 * A new account cannot speak in Daythread's name to third parties until the address is
 * proven, and the proof is a one-time link with the same guarantees as a password reset.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const linkToken = (body: string) => body.match(/\/verify-email\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
const emails: string[] = [];

describe("email verification", () => {
  beforeAll(() => { vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"); });
  afterEach(() => { jar.clear(); });
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const memberships = await prisma.orgMembership.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { businessId: true } });
    await prisma.business.deleteMany({ where: { id: { in: memberships.map((m) => m.businessId) } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    vi.unstubAllEnvs();
  });

  async function signUp() {
    const email = `verify-${stamp()}@example.test`;
    emails.push(email);
    sent.length = 0;
    await expect(signup(form({ name: "New Owner", email, password: "a-long-password-1" }))).rejects.toThrow(/NEXT_REDIRECT/);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const mail = sent.find((m) => m.to === email && /confirm your email/i.test(m.subject ?? ""));
    return { user, email, token: mail ? linkToken(mail.body) : null };
  }

  it("signup stores one hashed, unused verification token, sends the link, and leaves the address unproven", async () => {
    const { user, token } = await signUp();
    expect(user.emailVerifiedAt).toBeNull();
    expect(addressProven(user)).toBe(false);
    expect(token).toBeTruthy();
    const rows = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].purpose).toBe(EMAIL_VERIFICATION_PURPOSE);
    expect(rows[0].usedAt).toBeNull();
    expect(rows[0].token).toBe(hashVerificationToken(token!));
    expect(rows[0].token).not.toContain(token!);
  });

  it("following the link proves the address, burns every sibling, and leaves the session alone", async () => {
    const { user, token } = await signUp();
    jar.set("lf_session", await createSessionToken({ userId: user.id }));
    // A second link was requested meanwhile: the first is already dead, the second works once.
    const again = await resendVerification();
    expect(again.status).toBe("sent");
    const second = linkToken(sent[sent.length - 1].body)!;
    expect(await verifyEmail(token)).toMatchObject({ error: expect.stringMatching(/no longer works/) });
    const r = await verifyEmail(second);
    expect(r).toEqual({ ok: true, next: "/dashboard" });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(after.sessionVersion).toBe(user.sessionVersion);
    expect(await verifySessionToken(jar.get("lf_session")!)).not.toBeNull();
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id, usedAt: null } })).toBe(0);
    // Used, and then a tampered copy: the same refusal, nothing changes.
    expect(await verifyEmail(second)).toMatchObject({ error: expect.stringMatching(/no longer works/) });
    expect(await verifyEmail(second.slice(0, -2) + "zz")).toMatchObject({ error: expect.stringMatching(/no longer works/) });
    expect((await resendVerification()).status).toBe("already_verified");
  });

  it("an expired link fails the same way", async () => {
    const { user, token } = await signUp();
    await prisma.passwordResetToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await consumeEmailVerification(token)).toEqual({ ok: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
  });

  it("a password-reset token cannot verify an address, and a verification token cannot reset a password", async () => {
    const { user, token } = await signUp();
    const reset = generatePasswordResetToken();
    await prisma.passwordResetToken.create({ data: { userId: user.id, token: hashResetToken(reset), expiresAt: new Date(Date.now() + 60_000) } });
    expect(await consumeEmailVerification(reset)).toEqual({ ok: false });
    expect(await resetPassword(token!, form({ password: "another-long-pass-2" }))).toMatchObject({ error: expect.stringMatching(/invalid or has expired/) });
    // Even a row that somehow carried a verification-shaped hash is refused unless its purpose says so.
    const odd = generatePasswordResetToken();
    await prisma.passwordResetToken.create({ data: { userId: user.id, token: hashVerificationToken(odd), purpose: "PASSWORD_RESET", expiresAt: new Date(Date.now() + 60_000) } });
    expect(await consumeEmailVerification(odd)).toEqual({ ok: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
  });

  it("invitations from Daythread wait for a proven address while email is live, and send the moment it is proven", async () => {
    const { user, token } = await signUp();
    const membership = await prisma.orgMembership.findFirstOrThrow({ where: { userId: user.id } });
    const session = { userId: user.id, activeBusinessId: membership.businessId };
    const refused = await inviteClient(form({ name: "Someone", email: `victim-${stamp()}@example.test` }), session);
    expect(refused.error).toMatch(/confirm your email/i);
    const refusedTeam = await inviteTeammate(form({ name: "Someone", email: `victim2-${stamp()}@example.test` }), session);
    expect(refusedTeam.error).toMatch(/confirm your email|part of daythread pro/i);
    expect(sent.filter((m) => /invited you/i.test(m.subject ?? ""))).toHaveLength(0);
    expect(await verifyEmail(token)).toMatchObject({ ok: true });
    const ok = await inviteClient(form({ name: "Someone", email: `client-${stamp()}@example.test` }), session);
    expect(ok.error).toBeUndefined();
    expect(ok.link).toMatch(/\/invite\//);
  });

  it("without live email nothing waits on verification: the link cannot arrive, and neither can an invitation", async () => {
    live.email = false;
    try {
      const { user } = await signUp();
      expect(sent.some((m) => /confirm your email/i.test(m.subject ?? ""))).toBe(false);
      const membership = await prisma.orgMembership.findFirstOrThrow({ where: { userId: user.id } });
      const r = await inviteClient(form({ name: "Someone", email: `offline-${stamp()}@example.test` }), { userId: user.id, activeBusinessId: membership.businessId });
      expect(r.error).toBeUndefined();
      expect(r.delivery?.emailed).toBe(false);
    } finally {
      live.email = true;
    }
  });

  it("accepting an invitation with a new account proves the address the link was sent to", async () => {
    const s = stamp();
    const biz = await prisma.business.create({ data: { name: `Inviter ${s}`, handle: `inviter-${s}` } });
    const inviteeEmail = `invitee-${s}@example.test`;
    emails.push(inviteeEmail);
    const token = generateInvitationToken();
    await prisma.invitation.create({ data: { businessId: biz.id, email: inviteeEmail, role: "CLIENT", token, expiresAt: invitationExpiry(), status: "PENDING" } });
    await expect(acceptInvitation(token, form({ name: "Invitee", password: "invitee-pass-123" }))).rejects.toThrow(/NEXT_REDIRECT/);
    const invitee = await prisma.user.findUniqueOrThrow({ where: { email: inviteeEmail } });
    expect(invitee.emailVerifiedAt).not.toBeNull();
    await prisma.business.delete({ where: { id: biz.id } });
  });

  it("verification links are throttled per address across instances", async () => {
    const email = `throttle-${stamp()}@example.test`;
    emails.push(email);
    const user = await prisma.user.create({ data: { name: "T", email, passwordHash: await hashPassword("whatever-pass-1") } });
    const { issueEmailVerification } = await import("@/server/emailVerification");
    const outcomes: string[] = [];
    for (let i = 0; i < 6; i++) outcomes.push((await issueEmailVerification(user)).status);
    expect(outcomes.slice(0, 5).every((o) => o === "sent")).toBe(true);
    expect(outcomes[5]).toBe("throttled");
  });
});
