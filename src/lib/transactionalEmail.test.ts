import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSessionToken, type SessionPayload } from "@/lib/auth";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "198.51.100.44" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { sendTransactional, messagingIsLive } from "@/lib/messaging";
import { inviteClient, invitePartner, inviteTeammate, resendInvitation } from "@/app/actions/invitations";

/**
 * Production has no email provider configured, which is exactly the condition under which
 * every invitation screen used to say "Invitation sent — they'll get it by email". Nothing
 * was ever sent. The rule this pins is narrow and absolute: an invitation may only report
 * that it emailed somebody when the provider actually accepted the message.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

describe("transactional email honesty", () => {
  const ids: string[] = [];
  let session: SessionPayload;
  let businessId: string;

  beforeAll(async () => {
    const s = stamp();
    const business = await prisma.business.create({ data: { name: "Honest Co", handle: `honest-${s}`, timezone: "America/Chicago", planTier: "PRO", billingStatus: "ACTIVE" } });
    businessId = business.id;
    ids.push(business.id);
    const user = await prisma.user.create({ data: { name: "Owner", email: `honest-owner-${s}@example.test`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: user.id, businessId: business.id, role: "OWNER" } });
    await createSessionToken({ userId: user.id, activeBusinessId: business.id });
    session = { userId: user.id, activeBusinessId: business.id };
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };

  it("reports emailed:false with a reason when no provider is configured", async () => {
    const result = await sendTransactional({ channel: "EMAIL", to: "someone@example.test", subject: "Hello", body: "Body" });
    // This suite runs without RESEND_API_KEY, the same as production today.
    expect(messagingIsLive("EMAIL")).toBe(false);
    expect(result.emailed).toBe(false);
    expect(result.note.length).toBeGreaterThan(0);
    // The reason has to be something a person can act on, not an empty string or a code.
    expect(result.note).toMatch(/[a-z]/);
  });

  it("a client invitation returns a link and admits nothing was emailed", async () => {
    const s = stamp();
    const result = await inviteClient(form({ name: "Sam Client", email: `client-${s}@example.test` }), session);
    expect(result.error).toBeUndefined();
    expect(result.link).toContain("/invite/");
    expect(result.delivery?.emailed).toBe(false);
    expect(result.delivery?.note).toBeTruthy();
  });

  it("team and partner invitations do the same", async () => {
    const s = stamp();
    const teammate = await inviteTeammate(form({ name: "Tess Team", email: `team-${s}@example.test` }), session);
    expect(teammate.link).toContain("/invite/");
    expect(teammate.delivery?.emailed).toBe(false);

    const partner = await invitePartner(form({ name: "Pat Partner", email: `partner-${s}@example.test` }), session);
    expect(partner.link).toContain("/invite/");
    expect(partner.delivery?.emailed).toBe(false);
  });

  it("resending is honest too, and mints a fresh token", async () => {
    const s = stamp();
    await inviteTeammate(form({ name: "Rory Resend", email: `resend-${s}@example.test` }), session);
    const row = await prisma.invitation.findFirstOrThrow({ where: { businessId, email: `resend-${s}@example.test` } });
    const again = await resendInvitation(row.id, session);
    expect(again.error).toBeUndefined();
    expect(again.delivery?.emailed).toBe(false);
    const after = await prisma.invitation.findUniqueOrThrow({ where: { id: row.id } });
    // A resend replaces the token, so a link that leaked earlier stops working.
    expect(after.token).not.toBe(row.token);
    expect(again.link).toContain(after.token);
  });

  it("never claims delivery for an address the provider could not have accepted", async () => {
    for (const to of [null, "", "   "]) {
      const result = await sendTransactional({ channel: "EMAIL", to, subject: "Hello", body: "Body" });
      expect(result.emailed).toBe(false);
    }
  });
});
