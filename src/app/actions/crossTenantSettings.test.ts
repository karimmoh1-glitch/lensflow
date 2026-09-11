import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "198.51.100.52" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { setMembershipStatus, setPartnerConversationAccess } from "@/app/actions/team";
import { toggleAutomation, updateAutomation, deleteAutomation } from "@/app/actions/automations";
import { saveServices, saveAvailability, markNotificationsRead, updateBusinessMemory } from "@/app/actions/settings";
import { revokeInvitation, resendInvitation } from "@/app/actions/invitations";

/**
 * The configuration surfaces, which the earlier cross-tenant sweep did not cover: team
 * membership, automations, services, availability, notifications and invitations. Every id
 * below is real and valid; it simply belongs to somebody else. A pass means the action
 * refused or changed nothing — never that it quietly wrote into the wrong workspace.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const refused = (p: Promise<unknown>) => expect(p).rejects.toThrow();

type Workspace = {
  businessId: string;
  session: SessionPayload;
  ownerMembershipId: string;
  partnerMembershipId: string;
  automationId: string;
  serviceId: string;
  notificationId: string;
  invitationId: string;
};

describe("cross-tenant writes on configuration surfaces", () => {
  const ids: string[] = [];
  let a: Workspace;
  let b: Workspace;

  const build = async (label: string): Promise<Workspace> => {
    const s = stamp();
    const business = await prisma.business.create({ data: { name: `${label} Co`, handle: `${label}-${s}`, timezone: "America/Chicago", planTier: "PRO", billingStatus: "ACTIVE" } });
    ids.push(business.id);
    const owner = await prisma.user.create({ data: { name: `${label} Owner`, email: `${label}-owner-${s}@example.test`, passwordHash: "x" } });
    const ownerMembership = await prisma.orgMembership.create({ data: { userId: owner.id, businessId: business.id, role: "OWNER" } });
    const partner = await prisma.user.create({ data: { name: `${label} Partner`, email: `${label}-partner-${s}@example.test`, passwordHash: "x" } });
    const partnerMembership = await prisma.orgMembership.create({ data: { userId: partner.id, businessId: business.id, role: "PARTNER" } });
    const automation = await prisma.automation.create({ data: { businessId: business.id, name: `${label} follow-up`, trigger: "BOOKING_CREATED", action: "SEND_CONFIRMATION", offsetHours: 0, messageTemplate: "Hi {{name}}, you are booked.", enabled: false } });
    const service = await prisma.service.create({ data: { businessId: business.id, name: `${label} session`, priceCents: 15000, durationMins: 60 } });
    const notification = await prisma.notification.create({ data: { businessId: business.id, title: `${label} notice`, body: "Something happened", read: false } });
    const invitation = await prisma.invitation.create({ data: { businessId: business.id, email: `${label}-invitee-${s}@example.test`, role: "PHOTOGRAPHER", token: `tok-${label}-${s}`, invitedByUserId: owner.id, expiresAt: new Date(Date.now() + 7 * 86400000) } });
    return {
      businessId: business.id,
      session: { userId: owner.id, activeBusinessId: business.id },
      ownerMembershipId: ownerMembership.id,
      partnerMembershipId: partnerMembership.id,
      automationId: automation.id,
      serviceId: service.id,
      notificationId: notification.id,
      invitationId: invitation.id,
    };
  };

  beforeAll(async () => {
    a = await build("alpha");
    b = await build("bravo");
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  it("cannot suspend or re-scope somebody else's teammate", async () => {
    await refused(setMembershipStatus(b.partnerMembershipId, false, a.session));
    await refused(setPartnerConversationAccess(b.partnerMembershipId, true, a.session));
    const partner = await prisma.orgMembership.findUniqueOrThrow({ where: { id: b.partnerMembershipId } });
    expect(partner.status).toBe("ACTIVE");
    expect(partner.canViewAllConversations).toBe(false);
  });

  it("cannot switch on, edit or delete somebody else's automation", async () => {
    await toggleAutomation(b.automationId, true, a.session);
    expect((await prisma.automation.findUniqueOrThrow({ where: { id: b.automationId } })).enabled).toBe(false);

    const edited = await updateAutomation(b.automationId, { name: "Hijacked", trigger: "BOOKING_CREATED", action: "SEND_CONFIRMATION", offsetHours: 0, messageTemplate: "Hi {{name}}, this is not yours." }, a.session);
    expect(edited.error).toBeTruthy();
    expect((await prisma.automation.findUniqueOrThrow({ where: { id: b.automationId } })).name).toContain("bravo");

    const deleted = await deleteAutomation(b.automationId, a.session);
    expect(deleted.error).toBeTruthy();
    expect(await prisma.automation.count({ where: { id: b.automationId } })).toBe(1);
  });

  it("saving services cannot adopt or rename another workspace's service", async () => {
    await saveServices([{ id: b.serviceId, name: "Stolen session", priceCents: 1, durationMins: 5 }], a.session);
    const theirs = await prisma.service.findUniqueOrThrow({ where: { id: b.serviceId } });
    expect(theirs.name).toContain("bravo");
    expect(theirs.businessId).toBe(b.businessId);
    // The unknown id was treated as a new service in the caller's own workspace instead.
    expect(await prisma.service.count({ where: { businessId: a.businessId, name: "Stolen session" } })).toBe(1);
    // And the other workspace's service is untouched, not retired.
    expect(theirs.active).toBe(true);
  });

  it("saving availability only ever replaces the caller's own windows", async () => {
    await saveAvailability([{ weekday: 3, startMin: 600, endMin: 1020 }], b.session);
    await saveAvailability([{ weekday: 1, startMin: 540, endMin: 900 }], a.session);
    expect(await prisma.availability.count({ where: { businessId: b.businessId } })).toBe(1);
    expect((await prisma.availability.findFirstOrThrow({ where: { businessId: b.businessId } })).weekday).toBe(3);
  });

  it("availability windows are bounded and validated before they reach the public booking page", async () => {
    const before = await prisma.availability.count({ where: { businessId: a.businessId } });
    const tooMany = Array.from({ length: 80 }, () => ({ weekday: 1, startMin: 540, endMin: 1020 }));
    expect((await saveAvailability(tooMany, a.session)).error).toBeTruthy();
    for (const window of [
      { weekday: 9, startMin: 540, endMin: 1020 },
      { weekday: -1, startMin: 540, endMin: 1020 },
      { weekday: 1, startMin: 1020, endMin: 540 },
      { weekday: 1, startMin: 540, endMin: 540 },
      { weekday: 1, startMin: -60, endMin: 1020 },
      { weekday: 1, startMin: 540, endMin: 2000 },
      { weekday: Number.NaN, startMin: 540, endMin: 1020 },
    ]) {
      expect((await saveAvailability([window], a.session)).error, JSON.stringify(window)).toBeTruthy();
    }
    // A refusal must not have wiped what was already there.
    expect(await prisma.availability.count({ where: { businessId: a.businessId } })).toBe(before);
  });

  it("cannot mark another workspace's notifications read", async () => {
    await markNotificationsRead([b.notificationId], a.session);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: b.notificationId } })).read).toBe(false);
  });

  it("cannot revoke or resend another workspace's invitation", async () => {
    // Revoking reports rather than throws, so the screen can say why nothing changed.
    expect((await revokeInvitation(b.invitationId, a.session)).error).toBeTruthy();
    const again = await resendInvitation(b.invitationId, a.session);
    expect(again.error).toBeTruthy();
    const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: b.invitationId } });
    expect(invitation.status).toBe("PENDING");
    expect(invitation.token).toContain("tok-bravo");
  });

  it("business memory is written to the caller's own workspace only", async () => {
    await updateBusinessMemory({ memory: "alpha only" }, a.session);
    const other = await prisma.business.findUniqueOrThrow({ where: { id: b.businessId } });
    expect(JSON.stringify(other)).not.toContain("alpha only");
  });
});
