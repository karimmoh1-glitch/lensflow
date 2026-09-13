import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

const ip = { value: "203.0.113.77" };
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": ip.value }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { inviteClient, inviteTeammate, acceptInvitation, previewInvitation, resendInvitation } from "@/app/actions/invitations";
import { generateInvitationToken, hashInvitationToken, invitationExpiry } from "@/lib/invitations";

/**
 * An invitation link grants membership, so what the database holds must not be the link:
 * a copy of the table cannot accept anyone's invitation. Links already sent before hashing
 * keep working until they expire. And two people accepting the last seat at once get one
 * seat between them.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const businesses: string[] = [];
const emails: string[] = [];

async function proWorkspace() {
  const s = stamp();
  const biz = await prisma.business.create({ data: { name: `Tokens ${s}`, handle: `tokens-${s}`, planTier: "PRO", billingStatus: "ACTIVE" } });
  businesses.push(biz.id);
  const email = `owner-${s}@example.test`;
  emails.push(email);
  const owner = await prisma.user.create({ data: { name: "Owner", email, passwordHash: await hashPassword("owner-pass-123"), emailVerifiedAt: new Date() } });
  await prisma.orgMembership.create({ data: { userId: owner.id, businessId: biz.id, role: "OWNER" } });
  return { biz, owner, session: { userId: owner.id, activeBusinessId: biz.id } };
}

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: businesses } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

describe("invitation tokens", () => {
  it("are stored hashed: the link's token is not in the database, and the hash alone cannot be used as a link", async () => {
    const { session } = await proWorkspace();
    const clientEmail = `client-${stamp()}@example.test`;
    emails.push(clientEmail);
    const r = await inviteClient(form({ name: "Client", email: clientEmail }), session);
    expect(r.error).toBeUndefined();
    const raw = r.link!.split("/invite/")[1];
    const row = await prisma.invitation.findFirstOrThrow({ where: { email: clientEmail } });
    expect(row.token).toBe(hashInvitationToken(raw));
    expect(row.token).not.toBe(raw);
    // The stored value is not a usable link.
    expect(await previewInvitation(row.token)).toBeNull();
    expect(await acceptInvitation(row.token, form({ name: "Thief", password: "thief-pass-1234" }))).toEqual({ error: "This invitation link is invalid." });
    // The real link is.
    expect(await previewInvitation(raw)).toMatchObject({ status: "PENDING", email: clientEmail });
    await expect(acceptInvitation(raw, form({ name: "Client", password: "client-pass-123" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("ACCEPTED");
  });

  it("a resend replaces the stored hash; the old link dies, the new one works", async () => {
    const { session } = await proWorkspace();
    const mate = `mate-${stamp()}@example.test`;
    emails.push(mate);
    const first = await inviteTeammate(form({ name: "Mate", email: mate }), session);
    expect(first.error).toBeUndefined();
    const oldRaw = first.link!.split("/invite/")[1];
    const row = await prisma.invitation.findFirstOrThrow({ where: { email: mate } });
    const again = await resendInvitation(row.id, session);
    expect(again.error).toBeUndefined();
    const newRaw = again.link!.split("/invite/")[1];
    expect(newRaw).not.toBe(oldRaw);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: row.id } })).token).toBe(hashInvitationToken(newRaw));
    expect(await previewInvitation(oldRaw)).toBeNull();
    expect(await previewInvitation(newRaw)).toMatchObject({ status: "PENDING" });
  });

  it("a link issued before hashing still works until it expires", async () => {
    const { biz } = await proWorkspace();
    const legacyEmail = `legacy-${stamp()}@example.test`;
    emails.push(legacyEmail);
    const raw = generateInvitationToken();
    await prisma.invitation.create({ data: { businessId: biz.id, email: legacyEmail, role: "CLIENT", token: raw, expiresAt: invitationExpiry(), status: "PENDING" } });
    expect(await previewInvitation(raw)).toMatchObject({ status: "PENDING", email: legacyEmail });
    await expect(acceptInvitation(raw, form({ name: "Legacy", password: "legacy-pass-123" }))).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("two invitees accepting the last seat at once get one seat between them", async () => {
    const { biz } = await proWorkspace();
    // Pro seats five: the owner plus three more fill four; two outstanding invitations race for the fifth.
    for (let i = 0; i < 3; i++) {
      const u = await prisma.user.create({ data: { name: `Staff ${i}`, email: `staff-${i}-${stamp()}@example.test`, passwordHash: "x" } });
      emails.push(u.email);
      await prisma.orgMembership.create({ data: { userId: u.id, businessId: biz.id, role: "PHOTOGRAPHER" } });
    }
    const tokens = [generateInvitationToken(), generateInvitationToken()];
    const invitees = tokens.map((_, i) => `race-${i}-${stamp()}@example.test`);
    emails.push(...invitees);
    for (let i = 0; i < 2; i++) await prisma.invitation.create({ data: { businessId: biz.id, email: invitees[i], role: "PHOTOGRAPHER", token: hashInvitationToken(tokens[i]), expiresAt: invitationExpiry(), status: "PENDING" } });
    const outcomes = await Promise.all(tokens.map((t, i) => acceptInvitation(t, form({ name: `Racer ${i}`, password: "racer-pass-1234" })).then(() => "returned" as const, (e: Error) => (/NEXT_REDIRECT/.test(e.message) ? ("seated" as const) : ("threw" as const)))));
    expect(outcomes.sort()).toEqual(["returned", "seated"]);
    expect(await prisma.orgMembership.count({ where: { businessId: biz.id, role: { not: "CLIENT" }, status: "ACTIVE" } })).toBe(5);
  });
});

describe("the admin secret", () => {
  it("is metered in the shared table, so a fleet of instances cannot each grant a fresh window", async () => {
    vi.stubEnv("SEED_SECRET", "a-long-random-secret-for-tests-only");
    const { verifySeedSecret } = await import("@/lib/adminAuth");
    const from = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;
    const attempt = () => verifySeedSecret(new Request("http://localhost/api/admin/seed", { method: "POST", headers: { "x-seed-secret": "wrong", "x-forwarded-for": from } }));
    for (let i = 0; i < 10; i++) expect(await attempt()).toBe("unauthorized");
    expect(await attempt()).toBe("rate-limited");
    expect(await prisma.rateLimitHit.count({ where: { key: `admin-auth:${from}` } })).toBe(0); // hashed keys, never the raw address
    vi.unstubAllEnvs();
  });
});
