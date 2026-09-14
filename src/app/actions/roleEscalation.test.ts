import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 20}` }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { createSessionToken, verifySessionToken, type SessionPayload } from "@/lib/auth";
import { startUpgradeCheckout, openBillingPortal, claimBetaProOffer } from "@/app/actions/billing";
import { setMembershipStatus, setPartnerConversationAccess } from "@/app/actions/team";
import { inviteTeammate, invitePartner, revokeInvitation } from "@/app/actions/invitations";
import { disconnectIntegration, connectAppleCalendar } from "@/app/actions/connect";
import { deleteWorkspace, updateBusinessProfile, saveServices, saveAvailability, updateProfile } from "@/app/actions/settings";
import { deleteAutomation } from "@/app/actions/automations";
import { mergeClients } from "@/app/actions/clients";

/**
 * Inside one workspace: everything an owner or admin decides — billing, the team,
 * integrations, the workspace itself, its services and hours — refused to a photographer,
 * a partner and a client, refused to an owner who has been suspended, and refused to a
 * session that was revoked. Sessions here are real signed tokens verified by the server
 * (DAYTHREAD_STRICT_SESSIONS), and each refusal is checked against the database, not only
 * against the return value.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

type Who = "PHOTOGRAPHER" | "PARTNER" | "CLIENT" | "SUSPENDED_OWNER" | "REVOKED_ADMIN";
let businessId: string;
const userIds: string[] = [];
const sessions = {} as Record<Who | "OWNER", SessionPayload>;
let photographerMembershipId: string;
let integrationId: string;
let automationId: string;
let invitationId: string;
let clientA: string;
let clientB: string;

async function member(role: "OWNER" | "ADMIN" | "PHOTOGRAPHER" | "PARTNER" | "CLIENT", status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  const s = stamp();
  const user = await prisma.user.create({ data: { name: role, email: `role-${role.toLowerCase()}-${s}@example.test`, passwordHash: "x", emailVerifiedAt: new Date() } });
  userIds.push(user.id);
  const m = await prisma.orgMembership.create({ data: { userId: user.id, businessId, role, status } });
  const verified = await verifySessionToken(await createSessionToken({ userId: user.id, activeBusinessId: businessId }));
  if (!verified) throw new Error("session did not verify");
  return { user, membership: m, session: verified };
}

/** A refusal is a thrown "unauthorized"/redirect or a returned error; anything else is a pass-through. */
async function refused(call: () => Promise<unknown>): Promise<boolean> {
  try {
    const r = (await call()) as Record<string, unknown> | undefined | null | unknown[];
    if (Array.isArray(r)) return r.length === 0;
    if (!r) return false;
    return Boolean((r as { error?: unknown }).error) || (r as { ok?: unknown }).ok === false;
  } catch (e) {
    return /unauthorized|NEXT_REDIRECT:\/login|not allowed/i.test((e as Error).message);
  }
}

beforeAll(async () => {
  vi.stubEnv("DAYTHREAD_STRICT_SESSIONS", "1");
  const s = stamp();
  const biz = await prisma.business.create({ data: { name: `Roles ${s}`, handle: `roles-${s}`, planTier: "BUSINESS", billingStatus: "ACTIVE", stripeCustomerId: `cus_roles_${s}` } });
  businessId = biz.id;
  sessions.OWNER = (await member("OWNER")).session;
  const photographer = await member("PHOTOGRAPHER");
  photographerMembershipId = photographer.membership.id;
  sessions.PHOTOGRAPHER = photographer.session;
  sessions.PARTNER = (await member("PARTNER")).session;
  sessions.CLIENT = (await member("CLIENT")).session;
  sessions.SUSPENDED_OWNER = (await member("OWNER", "SUSPENDED")).session;
  const revoked = await member("ADMIN");
  sessions.REVOKED_ADMIN = revoked.session;
  // Signed out everywhere (logout, password change): the token still has a valid signature.
  await prisma.user.update({ where: { id: revoked.user.id }, data: { sessionVersion: { increment: 1 } } });
  integrationId = (await prisma.integration.create({ data: { businessId, provider: "APPLE_CALENDAR", status: "CONNECTED", accessToken: "abcd-efgh-ijkl-mnop", externalAccount: "owner@icloud.com" } })).id;
  automationId = (await prisma.automation.create({ data: { businessId, name: "Confirm", trigger: "BOOKING_CREATED", action: "SEND_CONFIRMATION", offsetHours: 0, messageTemplate: "Booked", enabled: true } })).id;
  invitationId = (await prisma.invitation.create({ data: { businessId, email: `pending-${s}@example.test`, role: "PHOTOGRAPHER", token: `tok-${s}-${Math.random().toString(36).slice(2)}`, expiresAt: new Date(Date.now() + 86_400_000), status: "PENDING" } })).id;
  await prisma.service.create({ data: { businessId, name: "Portrait", priceCents: 20000 } });
  clientA = (await prisma.client.create({ data: { businessId, name: "A", email: `a-${s}@example.test` } })).id;
  clientB = (await prisma.client.create({ data: { businessId, name: "B", email: `b-${s}@example.test` } })).id;
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  vi.unstubAllEnvs();
});

const OUTSIDERS: Who[] = ["PHOTOGRAPHER", "PARTNER", "CLIENT", "SUSPENDED_OWNER", "REVOKED_ADMIN"];
const NON_STAFF: Who[] = ["PARTNER", "CLIENT", "SUSPENDED_OWNER", "REVOKED_ADMIN"];

describe("owner and admin decisions are refused to everyone else in the workspace", () => {
  for (const who of OUTSIDERS) {
    it(`${who}: billing, team, integrations, workspace settings, deletion`, async () => {
      const s = () => sessions[who];
      const checks: Array<[string, () => Promise<unknown>]> = [
        ["startUpgradeCheckout", () => startUpgradeCheckout("PRO", "month", s())],
        ["openBillingPortal", () => openBillingPortal(undefined, s())],
        ["claimBetaProOffer", () => claimBetaProOffer(s())],
        ["setMembershipStatus", () => setMembershipStatus(photographerMembershipId, false, s())],
        ["setPartnerConversationAccess", () => setPartnerConversationAccess(photographerMembershipId, true, s())],
        ["inviteTeammate", () => inviteTeammate(form({ name: "X", email: `x-${stamp()}@example.test` }), s())],
        ["invitePartner", () => invitePartner(form({ name: "X", email: `y-${stamp()}@example.test` }), s())],
        ["revokeInvitation", () => revokeInvitation(invitationId, s())],
        ["disconnectIntegration", () => disconnectIntegration("APPLE_CALENDAR", s())],
        ["connectAppleCalendar", () => connectAppleCalendar("someone@icloud.com", "abcd-efgh-ijkl-mnop", s())],
        ["updateBusinessProfile", () => updateBusinessProfile({ name: "Hijacked", bio: "", timezone: "UTC", bufferMinutes: 0, bookingLeadHours: 0 }, s())],
        ["saveServices", () => saveServices([], s())],
        ["saveAvailability", () => saveAvailability([], s())],
        ["updateProfile", () => updateProfile({ name: "X", workspaceName: "Hijacked", timezone: "UTC" }, s())],
        ["deleteAutomation", () => deleteAutomation(automationId, s())],
        ["mergeClients", () => mergeClients(clientA, clientB, s())],
        ["deleteWorkspace", () => deleteWorkspace(`Roles`, s())],
      ];
      const passedThrough: string[] = [];
      for (const [name, call] of checks) if (!(await refused(call))) passedThrough.push(name);
      expect(passedThrough, `${who} was not refused`).toEqual([]);

      // And nothing moved.
      const biz = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
      expect(biz.name.startsWith("Roles")).toBe(true);
      expect(biz.planTier).toBe("BUSINESS");
      expect((await prisma.orgMembership.findUniqueOrThrow({ where: { id: photographerMembershipId } })).status).toBe("ACTIVE");
      expect((await prisma.integration.findUniqueOrThrow({ where: { id: integrationId } })).status).toBe("CONNECTED");
      expect(await prisma.automation.count({ where: { id: automationId } })).toBe(1);
      expect(await prisma.automation.count({ where: { businessId } })).toBe(1);
      expect((await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } })).status).toBe("PENDING");
      expect(await prisma.service.count({ where: { businessId } })).toBe(1);
      expect(await prisma.client.count({ where: { businessId } })).toBe(2);
    });
  }

  it("the owner can do the same things (the refusals above are about the role, not the call)", async () => {
    expect(await refused(() => setPartnerConversationAccess(photographerMembershipId, true, sessions.OWNER))).toBe(false);
    expect(await refused(() => saveAvailability([{ weekday: 1, startMin: 540, endMin: 1020 }], sessions.OWNER))).toBe(false);
  });
});

describe("staff-only work is refused to partners, clients, suspended and revoked sessions", () => {
  for (const who of NON_STAFF) {
    it(`${who}: inbox and people`, async () => {
      const { sendReplyAction } = await import("@/app/actions/inbox");
      const { addClientNote, createClient } = await import("@/app/actions/clients");
      const { toggleAutomation } = await import("@/app/actions/automations");
      const conv = await prisma.conversation.create({ data: { businessId, channel: "EMAIL", externalHandle: `c-${stamp()}@example.test`, clientId: clientA, lastMessageAt: new Date() } });
      const checks: Array<[string, () => Promise<unknown>]> = [
        ["sendReplyAction", () => sendReplyAction(conv.id, "hello", false, sessions[who])],
        ["addClientNote", () => addClientNote(clientA, "note", sessions[who])],
        ["createClient", () => createClient({ name: "Z", email: `z-${stamp()}@example.test` }, sessions[who])],
        ["toggleAutomation", () => toggleAutomation(automationId, false, sessions[who])],
      ];
      const passedThrough: string[] = [];
      for (const [name, call] of checks) if (!(await refused(call))) passedThrough.push(name);
      expect(passedThrough, `${who} was not refused`).toEqual([]);
      expect(await prisma.message.count({ where: { conversationId: conv.id } })).toBe(0);
      expect(await prisma.clientNote.count({ where: { clientId: clientA } })).toBe(0);
      expect((await prisma.automation.findUniqueOrThrow({ where: { id: automationId } })).enabled).toBe(true);
    });
  }
});
