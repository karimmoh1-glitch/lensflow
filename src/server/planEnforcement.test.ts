import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSessionToken, type SessionPayload } from "@/lib/auth";
import { PLANS } from "@/lib/billing";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "198.51.100.61" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { inviteTeammate, invitePartner } from "@/app/actions/invitations";
import { toggleAutomation } from "@/app/actions/automations";
import { generateDraftAction, sendReplyAction } from "@/app/actions/inbox";
import { activateIntegration } from "@/server/integrationQuota";

/**
 * A plan limit that only exists in the interface is decoration. Everything below goes
 * straight at the server action or the quota gate, the way a script with a valid session
 * would — no buttons, no hidden fields. A free workspace has to be refused here, or the
 * paywall does not exist.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("plan limits are enforced on the server", () => {
  const ids: string[] = [];
  let businessId: string;
  let session: SessionPayload;
  let conversationId: string;
  let smsConversationId: string;

  beforeAll(async () => {
    const s = stamp();
    const business = await prisma.business.create({ data: { name: "Thrifty Co", handle: `thrifty-${s}`, timezone: "America/Chicago", planTier: "FREE", billingStatus: null } });
    businessId = business.id;
    ids.push(business.id);
    const owner = await prisma.user.create({ data: { name: "Owner", email: `thrifty-owner-${s}@example.test`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: owner.id, businessId, role: "OWNER" } });
    await createSessionToken({ userId: owner.id, activeBusinessId: businessId });
    session = { userId: owner.id, activeBusinessId: businessId };

    const client = await prisma.client.create({ data: { businessId, name: "Casey", email: `casey-${s}@example.test`, phone: "+15125550144" } });
    conversationId = (await prisma.conversation.create({ data: { businessId, clientId: client.id, channel: "EMAIL", externalHandle: client.email!, lastMessageAt: new Date(), category: "PRIORITY" } })).id;
    await prisma.message.create({ data: { conversationId, direction: "INBOUND", body: "Are you free in June?" } });
    smsConversationId = (await prisma.conversation.create({ data: { businessId, clientId: client.id, channel: "SMS", externalHandle: "+15125550144", lastMessageAt: new Date(), category: "PRIORITY" } })).id;
    await prisma.message.create({ data: { conversationId: smsConversationId, direction: "INBOUND", body: "Hi" } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  it("the free plan is one seat, and a second invitation is refused", async () => {
    expect(PLANS.FREE.maxTeamSeats).toBe(1);
    const teammate = await inviteTeammate(form({ name: "Second Person", email: `second-${stamp()}@example.test` }), session);
    expect(teammate.error).toBeTruthy();
    expect(teammate.link).toBeUndefined();

    const partner = await invitePartner(form({ name: "A Partner", email: `partner-${stamp()}@example.test` }), session);
    expect(partner.error).toBeTruthy();

    // Nothing was written, so the limit cannot be walked past by inviting repeatedly.
    expect(await prisma.invitation.count({ where: { businessId, status: "PENDING" } })).toBe(0);
  });

  it("the fourth automation will not switch on, and the first three still do", async () => {
    expect(PLANS.FREE.maxAutomations).toBe(3);
    const made = [] as string[];
    for (let i = 0; i < 4; i++) {
      const row = await prisma.automation.create({ data: { businessId, name: `Rule ${i}`, trigger: "BOOKING_CREATED", action: "SEND_CONFIRMATION", offsetHours: 0, messageTemplate: "Hi {{name}}.", enabled: false } });
      made.push(row.id);
    }
    for (const id of made.slice(0, 3)) expect((await toggleAutomation(id, true, session)).error).toBeUndefined();
    const fourth = await toggleAutomation(made[3], true, session);
    expect(fourth.error).toBeTruthy();
    expect((await prisma.automation.findUniqueOrThrow({ where: { id: made[3] } })).enabled).toBe(false);

    // Switching one off is always allowed, so a downgraded workspace is never stuck.
    expect((await toggleAutomation(made[0], false, session)).error).toBeUndefined();
    expect((await toggleAutomation(made[3], true, session)).error).toBeUndefined();
  });

  it("the third connected channel is refused at the quota gate, not in the interface", async () => {
    expect(PLANS.FREE.maxIntegrations).toBe(2);
    const connect = (provider: "GOOGLE_CALENDAR" | "GOOGLE_DRIVE" | "DROPBOX") =>
      activateIntegration({ businessId, provider, create: { accessToken: "a", refreshToken: "r" }, update: { accessToken: "a" } });

    expect((await connect("GOOGLE_CALENDAR")).ok).toBe(true);
    expect((await connect("GOOGLE_DRIVE")).ok).toBe(true);
    const third = await connect("DROPBOX");
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.reason).toBe("limit");
    // The refused provider must not have been left half-connected.
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "DROPBOX" } } });
    expect(row?.status ?? "NOT_CONNECTED").not.toBe("CONNECTED");

    // Reconnecting one that is already active is not a new seat, so it still works.
    expect((await connect("GOOGLE_CALENDAR")).ok).toBe(true);
  });

  it("AI drafting is refused on the free plan, with a reason rather than a crash", async () => {
    expect(PLANS.FREE.aiEnabled).toBe(false);
    const result = await generateDraftAction(conversationId, session);
    expect(result.error).toBeTruthy();
    expect(result.text).toBeUndefined();
    // The message says what to do, not just "forbidden".
    expect(result.error).toMatch(/pro/i);
  });

  it("texting is refused on the free plan, and nothing is recorded as sent", async () => {
    expect(PLANS.FREE.smsEnabled).toBe(false);
    const before = await prisma.message.count({ where: { conversationId: smsConversationId, direction: "OUTBOUND" } });
    const result = await sendReplyAction(smsConversationId, "Sure, see you then", false, session);
    expect(result.ok).toBe(false);
    expect(await prisma.message.count({ where: { conversationId: smsConversationId, direction: "OUTBOUND", status: "SENT" } })).toBe(0);
    expect(await prisma.message.count({ where: { conversationId: smsConversationId, direction: "OUTBOUND" } })).toBe(before);
  });

  it("paying lifts the limits that refusal named", async () => {
    await prisma.business.update({ where: { id: businessId }, data: { planTier: "PRO", billingStatus: "ACTIVE" } });
    const teammate = await inviteTeammate(form({ name: "Now Allowed", email: `allowed-${stamp()}@example.test` }), session);
    expect(teammate.error).toBeUndefined();
    expect(teammate.link).toContain("/invite/");

    const draft = await generateDraftAction(conversationId, session);
    expect(draft.error).toBeUndefined();

    const dropbox = await activateIntegration({ businessId, provider: "DROPBOX", create: { accessToken: "a" }, update: { accessToken: "a" } });
    expect(dropbox.ok).toBe(true);
  });

  it("an unpaid subscription falls back to free rather than keeping paid features", async () => {
    await prisma.business.update({ where: { id: businessId }, data: { planTier: "PRO", billingStatus: "UNPAID" } });
    const draft = await generateDraftAction(conversationId, session);
    expect(draft.error).toBeTruthy();
  });
});
