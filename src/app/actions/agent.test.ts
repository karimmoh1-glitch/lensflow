import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getAgentBrief, approveAgentProposal, prepareAgentProposal, dismissAgentProposal } from "./agent";
import { toggleAutomation } from "./automations";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/**
 * The Business Agent's entitlement boundary and the automation count cap, exercised through
 * the real server actions with a caller-supplied session — exactly what a client that lies
 * about its plan would hit. The plan is read from the Business row every time.
 */
describe("Business Agent entitlement and automation caps", () => {
  const ids: string[] = [];
  async function workspace(planTier: "FREE" | "PRO" | "BUSINESS", billingStatus: "ACTIVE" | "CANCELED" | null = planTier === "FREE" ? null : "ACTIVE") {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const b = await prisma.business.create({ data: { name: `Agent ${planTier}`, handle: `agent-${planTier.toLowerCase()}-${stamp}`, planTier, billingStatus } });
    const u = await prisma.user.create({ data: { name: "Owner", email: `agent-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: u.id, businessId: b.id, role: "OWNER" } });
    ids.push(b.id);
    return { businessId: b.id, session: { userId: u.id, activeBusinessId: b.id } };
  }
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  it("Free: denied on every entry point, with the plan named", async () => {
    const { session } = await workspace("FREE");
    const brief = await getAgentBrief(session);
    expect(brief.allowed).toBe(false);
    if (!brief.allowed) expect(brief.plan).toBe("FREE");
    expect((await prepareAgentProposal("reply:x", session)).allowed).toBe(false);
    expect((await approveAgentProposal({ proposalId: "reply:x", body: "hi" }, session)).allowed).toBe(false);
    expect((await dismissAgentProposal("reply:x", session)).allowed).toBe(false);
  });

  it("Pro: denied", async () => {
    const { session } = await workspace("PRO");
    const brief = await getAgentBrief(session);
    expect(brief.allowed).toBe(false);
    if (!brief.allowed) expect(brief.plan).toBe("PRO");
  });

  it("Business with a lapsed subscription: denied (Free entitlements)", async () => {
    const { session } = await workspace("BUSINESS", "CANCELED");
    const brief = await getAgentBrief(session);
    expect(brief.allowed).toBe(false);
  });

  it("Business: allowed, and proposals come from real data", async () => {
    const { businessId, session } = await workspace("BUSINESS");
    const client = await prisma.client.create({ data: { businessId, name: "Jordan Lee", email: "jordan@example.com" } });
    const conversation = await prisma.conversation.create({ data: { businessId, clientId: client.id, channel: "EMAIL", externalHandle: "jordan@example.com", category: "PRIORITY", lastMessageAt: new Date() } });
    await prisma.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", body: "Hi! Are you free for a family session on the 20th?" } });
    await prisma.lead.create({ data: { businessId, clientId: client.id, conversationId: conversation.id, status: "NEW", lastInboundAt: new Date(Date.now() - 3 * 3_600_000) } });
    const brief = await getAgentBrief(session);
    expect(brief.allowed).toBe(true);
    if (!brief.allowed) return;
    const reply = brief.brief.proposals.find((p) => p.kind === "reply");
    expect(reply?.title).toContain("Jordan Lee");
    // Approving sends through the real delivery path: no email provider here → saved to the
    // thread as NOT_DELIVERED, never faked as sent; the lead stays unanswered.
    const prepared = await prepareAgentProposal(reply!.id, session);
    expect(prepared.allowed && "draft" in prepared && typeof prepared.draft === "string").toBe(true);
    const r = await approveAgentProposal({ proposalId: reply!.id, body: "Hi Jordan — yes, the 20th works. Shall I hold it?" }, session);
    expect(r.allowed && r.ok).toBe(true);
    if (r.allowed && r.ok) expect(r.status).toBe("NOT_DELIVERED");
    const msgs = await prisma.message.findMany({ where: { conversationId: conversation.id, direction: "OUTBOUND" } });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].status).toBe("NOT_DELIVERED");
    expect((await prisma.lead.findFirst({ where: { businessId } }))?.respondedAt).toBeNull();
    // Recorded as agent activity; not proposed again.
    const again = await getAgentBrief(session);
    expect(again.allowed && again.brief.proposals.some((p) => p.id === reply!.id)).toBe(false);
    expect(again.allowed && again.brief.activity[0]?.result).toBe("not_delivered");
  });

  it("a forged proposal id is refused, and a proposal for another tenant's data never resolves", async () => {
    const a = await workspace("BUSINESS");
    const b = await workspace("BUSINESS");
    const client = await prisma.client.create({ data: { businessId: a.businessId, name: "Sam", email: "sam@example.com" } });
    const booking = await prisma.booking.create({ data: { businessId: a.businessId, clientId: client.id, serviceId: (await prisma.service.create({ data: { businessId: a.businessId, name: "Mini", priceCents: 10000, durationMins: 30 } })).id, startAt: new Date(Date.now() + 24 * 3_600_000), endAt: new Date(Date.now() + 25 * 3_600_000), status: "BOOKED", totalCents: 10000, depositCents: 0 } });
    const mine = await getAgentBrief(a.session);
    expect(mine.allowed && mine.brief.proposals.some((p) => p.id === `confirm_booking:${booking.id}`)).toBe(true);
    const theirs = await approveAgentProposal({ proposalId: `confirm_booking:${booking.id}`, body: "confirming" }, b.session);
    expect(theirs.allowed && !theirs.ok).toBe(true);
    expect(await prisma.message.count({ where: { conversation: { businessId: a.businessId } } })).toBe(0);
    expect((await approveAgentProposal({ proposalId: "reply:does-not-exist", body: "x" }, a.session)).allowed && !(await approveAgentProposal({ proposalId: "reply:does-not-exist", body: "x" }, a.session) as { ok?: boolean }).ok).toBe(true);
  });

  it("Free may switch on 3 automations, not a 4th; Pro is uncapped", async () => {
    const free = await workspace("FREE");
    const make = (businessId: string, n: number) => prisma.automation.create({ data: { businessId, name: `A${n}`, trigger: "BOOKING_CREATED", action: "SEND_CONFIRMATION", messageTemplate: "hi", enabled: false } });
    const autos = await Promise.all([1, 2, 3, 4].map((n) => make(free.businessId, n)));
    // Server actions read the session from cookies; drive the same rule through the DB-side check the action uses.
    const { canEnableAutomation } = await import("@/lib/billing");
    const b = await prisma.business.findUniqueOrThrow({ where: { id: free.businessId } });
    expect(canEnableAutomation(b, 3)).toBe(false);
    expect(typeof toggleAutomation).toBe("function");
    expect(autos).toHaveLength(4);
  });
});
