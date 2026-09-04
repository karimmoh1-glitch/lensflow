import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { reclassifyConversation, removeConversationForMe, setClientRelationship, summarizeConversation, assignConversation, markConversationRead } from "./conversations";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/**
 * A malicious owner of Business B, holding a valid session, tries every conversation action
 * against Business A's data. Each one must refuse without touching A. Runs against the real
 * database with two isolated fixture businesses.
 */
describe("conversation actions are tenant-isolated", () => {
  let aId: string;
  let bId: string;
  let aConvId: string;
  let aClientId: string;
  let bSession: { userId: string; activeBusinessId: string };
  let aMembershipId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const a = await prisma.business.create({ data: { name: "Tenant A", handle: `tenant-a-${stamp}`, planTier: "BUSINESS", billingStatus: "ACTIVE" } });
    const b = await prisma.business.create({ data: { name: "Tenant B", handle: `tenant-b-${stamp}`, planTier: "BUSINESS", billingStatus: "ACTIVE" } });
    aId = a.id;
    bId = b.id;
    const aOwner = await prisma.user.create({ data: { name: "A Owner", email: `a-owner-${stamp}@example.com`, passwordHash: "x" } });
    const bOwner = await prisma.user.create({ data: { name: "B Owner", email: `b-owner-${stamp}@example.com`, passwordHash: "x" } });
    const aMembership = await prisma.orgMembership.create({ data: { userId: aOwner.id, businessId: aId, role: "OWNER" } });
    aMembershipId = aMembership.id;
    await prisma.orgMembership.create({ data: { userId: bOwner.id, businessId: bId, role: "OWNER" } });
    bSession = { userId: bOwner.id, activeBusinessId: bId };
    const aClient = await prisma.client.create({ data: { businessId: aId, name: "A Customer", email: `a-customer-${stamp}@example.com`, relationship: "LEAD" } });
    aClientId = aClient.id;
    const conv = await prisma.conversation.create({ data: { businessId: aId, clientId: aClientId, channel: "EMAIL", externalHandle: aClient.email!, lastMessageAt: new Date() } });
    aConvId = conv.id;
    await prisma.message.create({ data: { conversationId: aConvId, direction: "INBOUND", body: "Are you free Saturday?" } });
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: aId } });
    await prisma.business.delete({ where: { id: bId } });
    await prisma.user.deleteMany({ where: { email: { contains: "-owner-" } } });
  });

  it("reclassify refuses and leaves A's category and rules untouched", async () => {
    const r = await reclassifyConversation(aConvId, "AUTOMATED", bSession);
    expect(r.error).toBeTruthy();
    const conv = await prisma.conversation.findUnique({ where: { id: aConvId } });
    expect(conv?.category).toBe("PRIORITY");
    expect(await prisma.senderRule.count({ where: { businessId: aId } })).toBe(0);
    expect(await prisma.senderRule.count({ where: { businessId: bId } })).toBe(0);
  });

  it("delete-for-me refuses across tenants", async () => {
    const r = await removeConversationForMe(aConvId, true, bSession);
    expect(r.error).toBeTruthy();
    expect((await prisma.conversation.findUnique({ where: { id: aConvId } }))?.archived).toBe(false);
  });

  it("relationship changes refuse across tenants", async () => {
    const r = await setClientRelationship(aClientId, "CUSTOMER", bSession);
    expect(r.error).toBeTruthy();
    expect((await prisma.client.findUnique({ where: { id: aClientId } }))?.relationship).toBe("LEAD");
  });

  it("summaries refuse across tenants and store nothing", async () => {
    const r = await summarizeConversation(aConvId, {}, bSession);
    expect(r.error).toBeTruthy();
    expect((await prisma.conversation.findUnique({ where: { id: aConvId } }))?.summary).toBeNull();
  });

  it("read state cannot be flipped across tenants", async () => {
    await markConversationRead(aConvId, true, bSession);
    expect((await prisma.conversation.findUnique({ where: { id: aConvId } }))?.lastReadAt).toBeNull();
  });

  it("assignment refuses across tenants, and refuses a membership from another business", async () => {
    const cross = await assignConversation(aConvId, aMembershipId, bSession);
    expect(cross.error).toBeTruthy();
    expect((await prisma.conversation.findUnique({ where: { id: aConvId } }))?.assigneeMembershipId).toBeNull();
    // B's own conversation, but A's membership as the assignee
    const bConv = await prisma.conversation.create({ data: { businessId: bId, channel: "EMAIL", externalHandle: "x@b.example", lastMessageAt: new Date() } });
    const foreign = await assignConversation(bConv.id, aMembershipId, bSession);
    expect(foreign.error).toMatch(/isn't in this workspace/);
    expect((await prisma.conversation.findUnique({ where: { id: bConv.id } }))?.assigneeMembershipId).toBeNull();
  });

  it("assignment is a Business-plan capability, enforced server-side", async () => {
    await prisma.business.update({ where: { id: bId }, data: { planTier: "PRO" } });
    const bConv = await prisma.conversation.findFirst({ where: { businessId: bId } });
    const bMembership = await prisma.orgMembership.findFirst({ where: { businessId: bId } });
    const r = await assignConversation(bConv!.id, bMembership!.id, bSession);
    expect(r.error).toMatch(/Business plan/);
  });
});
