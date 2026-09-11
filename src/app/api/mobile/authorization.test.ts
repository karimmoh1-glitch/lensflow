import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "198.51.100.9" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

/**
 * Membership is not permission. A CLIENT holds a login for their own portal and a PARTNER
 * only sees work assigned to them, yet both authenticate against the same workspace — so
 * every staff-only mobile read has to check the role, not just the token. These are the
 * routes that did not, pinned so they cannot regress.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const req = (path: string, token: string) => new Request(`http://localhost${path}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("mobile API authorization", () => {
  const ids: string[] = [];
  let businessId: string;
  let ownerToken: string;
  let clientToken: string;
  let partnerToken: string;
  let partnerMembershipId: string;
  let leadId: string;
  let conversationId: string;
  let ownBookingId: string;
  let otherBookingId: string;

  beforeAll(async () => {
    const s = stamp();
    const biz = await prisma.business.create({ data: { name: "Roles Co", handle: `roles-${s}`, timezone: "America/Chicago", planTier: "PRO", billingStatus: "ACTIVE" } });
    businessId = biz.id;
    ids.push(biz.id);
    const mk = async (role: "OWNER" | "CLIENT" | "PARTNER", email: string) => {
      const u = await prisma.user.create({ data: { name: role, email, passwordHash: "x" } });
      const m = await prisma.orgMembership.create({ data: { userId: u.id, businessId: biz.id, role } });
      return { userId: u.id, membershipId: m.id, token: await createSessionToken({ userId: u.id, activeBusinessId: biz.id }) };
    };
    const owner = await mk("OWNER", `roles-owner-${s}@example.com`);
    const customer = await mk("CLIENT", `roles-client-${s}@example.com`);
    const partner = await mk("PARTNER", `roles-partner-${s}@example.com`);
    ownerToken = owner.token;
    clientToken = customer.token;
    partnerToken = partner.token;
    partnerMembershipId = partner.membershipId;

    const service = await prisma.service.create({ data: { businessId: biz.id, name: "Session", priceCents: 20000, durationMins: 60 } });
    // The customer's own record, linked to their login, plus somebody else entirely.
    const theirClient = await prisma.client.create({ data: { businessId: biz.id, name: "The Customer", email: `roles-client-${s}@example.com`, userId: customer.userId } });
    const someoneElse = await prisma.client.create({ data: { businessId: biz.id, name: "Private Person", email: "private@example.test", phone: "+15125550111" } });
    const conversation = await prisma.conversation.create({ data: { businessId: biz.id, clientId: someoneElse.id, channel: "EMAIL", externalHandle: "private@example.test", lastMessageAt: new Date(), category: "PRIORITY" } });
    await prisma.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", body: "Confidential enquiry about my wedding budget" } });
    conversationId = conversation.id;
    leadId = (await prisma.lead.create({ data: { businessId: biz.id, clientId: someoneElse.id, conversationId: conversation.id, status: "NEW", lastInboundAt: new Date() } })).id;
    ownBookingId = (await prisma.booking.create({ data: { businessId: biz.id, clientId: theirClient.id, serviceId: service.id, startAt: new Date(Date.now() + 86400000), endAt: new Date(Date.now() + 90000000), status: "CONFIRMED", totalCents: 20000 } })).id;
    otherBookingId = (await prisma.booking.create({ data: { businessId: biz.id, clientId: someoneElse.id, serviceId: service.id, startAt: new Date(Date.now() + 172800000), endAt: new Date(Date.now() + 176400000), status: "CONFIRMED", totalCents: 20000 } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  it("the lead pipeline is staff only: a customer's login and a partner's are both refused", async () => {
    const { GET } = await import("./leads/route");
    expect((await GET(req("/api/mobile/leads", clientToken))).status).toBe(403);
    expect((await GET(req("/api/mobile/leads", partnerToken))).status).toBe(403);
    const ok = await GET(req("/api/mobile/leads", ownerToken));
    expect(ok.status).toBe(200);
    expect((await ok.json()).leads.length).toBeGreaterThan(0);
  });

  it("a lead's transcript is staff only, so nobody reads another customer's messages", async () => {
    const { GET } = await import("./leads/[id]/route");
    const denied = await GET(req(`/api/mobile/leads/${leadId}`, clientToken), params(leadId));
    expect(denied.status).toBe(403);
    expect(JSON.stringify(await denied.json())).not.toContain("Confidential");
    expect((await GET(req(`/api/mobile/leads/${leadId}`, partnerToken), params(leadId))).status).toBe(403);
    expect((await GET(req(`/api/mobile/leads/${leadId}`, ownerToken), params(leadId))).status).toBe(200);
  });

  it("the business's day, its open slots and its connected accounts are staff only", async () => {
    const home = (await import("./home/route")).GET;
    const integrations = (await import("./integrations/route")).GET;
    const availability = (await import("./leads/[id]/availability/route")).GET;
    for (const token of [clientToken, partnerToken]) {
      expect((await home(req("/api/mobile/home", token))).status).toBe(403);
      expect((await integrations(req("/api/mobile/integrations", token))).status).toBe(403);
      expect((await availability(req(`/api/mobile/leads/${leadId}/availability`, token), params(leadId))).status).toBe(403);
    }
    expect((await home(req("/api/mobile/home", ownerToken))).status).toBe(200);
    expect((await integrations(req("/api/mobile/integrations", ownerToken))).status).toBe(200);
  });

  it("booking detail stays inside each role's scope, and an id outside it is a 404 rather than a hint", async () => {
    const { GET } = await import("./bookings/[id]/route");
    // The customer may open their own booking, and nobody else's.
    expect((await GET(req(`/api/mobile/bookings/${ownBookingId}`, clientToken), params(ownBookingId))).status).toBe(200);
    const peek = await GET(req(`/api/mobile/bookings/${otherBookingId}`, clientToken), params(otherBookingId));
    expect(peek.status).toBe(404);
    expect(JSON.stringify(await peek.json())).not.toContain("private@example.test");
    // The partner is assigned nothing, so both are out of scope.
    expect((await GET(req(`/api/mobile/bookings/${otherBookingId}`, partnerToken), params(otherBookingId))).status).toBe(404);
    await prisma.booking.update({ where: { id: otherBookingId }, data: { assignedMembershipId: partnerMembershipId } });
    expect((await GET(req(`/api/mobile/bookings/${otherBookingId}`, partnerToken), params(otherBookingId))).status).toBe(200);
    // Staff see the workspace's bookings.
    expect((await GET(req(`/api/mobile/bookings/${otherBookingId}`, ownerToken), params(otherBookingId))).status).toBe(200);
  });

  it("every staff route refuses a customer's login at its own boundary, before it reads anything", async () => {
    // These ten routes used to authenticate, query, and only then hand the session to an
    // action that checked the role. The answer was right but the read had already happened,
    // which let a customer's login probe which lead and conversation ids exist.
    const post = (path: string, token: string, body: unknown = {}) =>
      new Request(`http://localhost${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

    type Handler = (r: Request, p: { params: Promise<{ id: string }> }) => Promise<Response>;
    const cases: Array<[string, Promise<Record<string, unknown>>, string, unknown]> = [
      ["POST", import("./assistant/route"), "/api/mobile/assistant", { question: "who are my clients" }],
      ["POST", import("./conversations/[id]/draft/route"), `/api/mobile/conversations/${conversationId}/draft`, {}],
      ["POST", import("./conversations/[id]/read/route"), `/api/mobile/conversations/${conversationId}/read`, {}],
      ["POST", import("./conversations/[id]/reply/route"), `/api/mobile/conversations/${conversationId}/reply`, { body: "hello" }],
      ["POST", import("./conversations/[id]/summary/route"), `/api/mobile/conversations/${conversationId}/summary`, {}],
      ["POST", import("./leads/[id]/follow-up/route"), `/api/mobile/leads/${leadId}/follow-up`, { at: new Date(Date.now() + 86400000).toISOString() }],
      ["POST", import("./leads/[id]/handled/route"), `/api/mobile/leads/${leadId}/handled`, {}],
      ["POST", import("./leads/[id]/status/route"), `/api/mobile/leads/${leadId}/status`, { status: "WON" }],
      ["POST", import("./leads/[id]/draft/route"), `/api/mobile/leads/${leadId}/draft`, {}],
      ["POST", import("./leads/[id]/reply/route"), `/api/mobile/leads/${leadId}/reply`, { body: "hello" }],
    ];

    for (const [method, mod, path, body] of cases) {
      const handlers = await mod;
      const id = path.split("/")[4];
      const call = (method === "GET" ? handlers.GET : handlers.POST) as Handler;
      const request = method === "GET" ? req(path, clientToken) : post(path, clientToken, body);
      const res = await call(request, params(id));
      expect(res.status, `${method} ${path} let a customer's login through`).toBe(403);
    }
  });

  it("an unparseable booking time is refused rather than becoming a server error", async () => {
    const { POST } = await import("./leads/[id]/book/route");
    const bad = new Request(`http://localhost/api/mobile/leads/${leadId}/book`, { method: "POST", headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ startISO: "not a date" }) });
    const res = await POST(bad, params(leadId));
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(500);
  });
});
