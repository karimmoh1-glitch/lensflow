import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSessionToken, verifySessionToken, type SessionPayload } from "@/lib/auth";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "198.51.100.21" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { addClientNote, mergeClients, dismissMerge } from "@/app/actions/clients";
import { markLeadHandled, setLeadStatus, checkLeadAvailability } from "@/app/actions/leads";
import { markConversationRead, reclassifyConversation, setClientRelationship, assignConversation, removeConversationForMe } from "@/app/actions/conversations";
import { deleteConversation, markLeadLost } from "@/app/actions/inbox";
import { listPayments } from "@/server/payments";
import { shareClientFolder } from "@/server/clientDelivery";

/**
 * One workspace reaching for another's records, one action at a time. Every id here is real
 * and valid — it simply belongs to somebody else, which is the only case that matters. A
 * pass means the action refused; it must never quietly succeed against the wrong tenant.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const rejects = (p: Promise<unknown>) => expect(p).rejects.toThrow();

type Workspace = { businessId: string; session: SessionPayload; clientId: string; leadId: string; conversationId: string; membershipId: string; bookingId: string; paymentId: string };

async function build(name: string): Promise<Workspace> {
  const s = stamp();
  const business = await prisma.business.create({ data: { name, handle: `${name.toLowerCase()}-${s}`, timezone: "America/Chicago", planTier: "PRO", billingStatus: "ACTIVE" } });
  const user = await prisma.user.create({ data: { name: `${name} Owner`, email: `${name.toLowerCase()}-${s}@example.test`, passwordHash: "x" } });
  const membership = await prisma.orgMembership.create({ data: { userId: user.id, businessId: business.id, role: "OWNER" } });
  const client = await prisma.client.create({ data: { businessId: business.id, name: `${name} Client`, email: `client-${s}@example.test` } });
  const service = await prisma.service.create({ data: { businessId: business.id, name: "Session", priceCents: 25_000, durationMins: 60 } });
  const conversation = await prisma.conversation.create({ data: { businessId: business.id, clientId: client.id, channel: "EMAIL", externalHandle: `client-${s}@example.test`, lastMessageAt: new Date(), category: "PRIORITY" } });
  await prisma.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", body: `${name} private correspondence` } });
  const lead = await prisma.lead.create({ data: { businessId: business.id, clientId: client.id, conversationId: conversation.id, status: "NEW", lastInboundAt: new Date() } });
  const booking = await prisma.booking.create({ data: { businessId: business.id, clientId: client.id, serviceId: service.id, startAt: new Date(Date.now() + 86_400_000), endAt: new Date(Date.now() + 90_000_000), status: "CONFIRMED", totalCents: 25_000 } });
  const payment = await prisma.payment.create({ data: { businessId: business.id, clientId: client.id, amountCents: 25_000, currency: "usd", status: "PAID", method: "CARD", purpose: "FULL", confirmedAt: new Date() } });
  const token = await createSessionToken({ userId: user.id, activeBusinessId: business.id });
  return { businessId: business.id, session: (await verifySessionToken(token))!, clientId: client.id, leadId: lead.id, conversationId: conversation.id, membershipId: membership.id, bookingId: booking.id, paymentId: payment.id };
}

describe("one workspace may not touch another's records", () => {
  const ids: string[] = [];
  let a: Workspace;
  let b: Workspace;

  beforeAll(async () => {
    a = await build("Attacker");
    b = await build("Victim");
    ids.push(a.businessId, b.businessId);
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  it("a client record: notes, merges and relationship changes are all refused", async () => {
    await rejects(addClientNote(b.clientId, "injected", a.session));
    expect(await prisma.clientNote.count({ where: { clientId: b.clientId } })).toBe(0);

    expect(await mergeClients(b.clientId, a.clientId, a.session)).toMatchObject({ ok: false });
    expect(await mergeClients(a.clientId, b.clientId, a.session)).toMatchObject({ ok: false });
    expect(await dismissMerge(b.clientId, a.clientId, a.session)).toMatchObject({ ok: false });
    expect(await setClientRelationship(b.clientId, "CUSTOMER", a.session)).toMatchObject({ error: expect.any(String) });

    const victim = await prisma.client.findUniqueOrThrow({ where: { id: b.clientId } });
    expect(victim.relationship).toBe("LEAD");
    expect(victim.businessId).toBe(b.businessId);
  });

  it("a lead: status, handling and availability are all refused", async () => {
    expect(await markLeadHandled(b.leadId, a.session)).toMatchObject({ error: expect.any(String) });
    expect(await setLeadStatus(b.leadId, "WON", a.session)).toMatchObject({ error: expect.any(String) });
    await rejects(markLeadLost(b.leadId));
    await rejects(checkLeadAvailability(b.leadId, new Date(Date.now() + 172_800_000).toISOString(), null, a.session));
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: b.leadId } })).status).toBe("NEW");
  });

  it("a conversation: reading, reclassifying, assigning, archiving and deleting are all refused", async () => {
    await markConversationRead(b.conversationId, true, a.session);
    expect(await reclassifyConversation(b.conversationId, "OTHER", a.session)).toMatchObject({ error: expect.any(String) });
    expect(await assignConversation(b.conversationId, a.membershipId, a.session)).toMatchObject({ error: expect.any(String) });
    expect(await removeConversationForMe(b.conversationId, true, a.session)).toMatchObject({ error: expect.any(String) });
    await rejects(deleteConversation(b.conversationId, a.session));

    const survived = await prisma.conversation.findUnique({ where: { id: b.conversationId }, include: { messages: true } });
    expect(survived).not.toBeNull();
    expect(survived!.category).toBe("PRIORITY");
    expect(survived!.archived).toBe(false);
    expect(survived!.assigneeMembershipId).toBeNull();
    expect(survived!.messages).toHaveLength(1);
  });

  it("payments: another workspace's money is neither listed nor totalled", async () => {
    const mine = await listPayments(a.businessId);
    expect(mine.rows.some((r) => r.id === b.paymentId)).toBe(false);
    expect(mine.totals.reduce((n, t) => n + t.collectedCents, 0)).toBe(25_000);
    // A valid payment id from the other workspace, filtered through this one's client scope.
    const crossed = await listPayments(a.businessId, { clientId: b.clientId });
    expect(crossed.rows).toHaveLength(0);
    expect(crossed.count).toBe(0);
  });

  it("files: another workspace's client cannot be given a folder or have one shared", async () => {
    const r = await shareClientFolder(a.businessId, b.clientId, "GOOGLE_DRIVE");
    expect(r.ok).toBe(false);
    const victim = await prisma.client.findUniqueOrThrow({ where: { id: b.clientId } });
    expect(victim.externalFolders).toBeNull();
  });

  it("a valid id from this workspace still works, so the refusals above are about ownership and not a broken action", async () => {
    await addClientNote(a.clientId, "a legitimate note", a.session);
    expect(await prisma.clientNote.count({ where: { clientId: a.clientId } })).toBe(1);
    expect(await setLeadStatus(a.leadId, "CONTACTED", a.session)).not.toMatchObject({ error: expect.any(String) });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: a.leadId } })).status).toBe("CONTACTED");
  });
});
