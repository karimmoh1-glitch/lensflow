import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";
import { ingestInboundMessage } from "@/server/leadIngestion";
import { addDays, setHours, setMinutes } from "date-fns";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "198.51.100.9" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

/**
 * The parity routes: every write the app can make goes through the same action the web uses,
 * refuses another tenant's ids, and respects roles. Real database, two workspaces.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const req = (path: string, token: string | null, init: RequestInit = {}) => new Request(`http://localhost${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown, method = "POST"): RequestInit => ({ method, body: JSON.stringify(body) });

describe("mobile parity routes", () => {
  const ids: string[] = [];
  let a: { businessId: string; token: string; membershipId: string; conversationId: string; leadId: string; clientId: string; staffToken: string };
  let b: { businessId: string; token: string };

  async function workspace(name: string, plan: "PRO" | "FREE" = "PRO") {
    const s = stamp();
    const biz = await prisma.business.create({ data: { name, handle: `par-${s}`, timezone: "America/Chicago", planTier: plan, billingStatus: plan === "PRO" ? "ACTIVE" : null } });
    const user = await prisma.user.create({ data: { name: `${name} Owner`, email: `par-${s}@example.net`, passwordHash: "x" } });
    const m = await prisma.orgMembership.create({ data: { userId: user.id, businessId: biz.id, role: "OWNER" } });
    ids.push(biz.id);
    return { businessId: biz.id, membershipId: m.id, userId: user.id, token: await createSessionToken({ userId: user.id, activeBusinessId: biz.id }) };
  }
  beforeAll(async () => {
    const wa = await workspace("Parity A");
    const wb = await workspace("Parity B");
    const staff = await prisma.user.create({ data: { name: "Staff", email: `par-staff-${stamp()}@example.net`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: staff.id, businessId: wa.businessId, role: "PHOTOGRAPHER" } });
    await prisma.service.create({ data: { businessId: wa.businessId, name: "Family session", priceCents: 35000, durationMins: 60 } });
    await prisma.availability.createMany({ data: [1, 2, 3, 4, 5].map((weekday) => ({ businessId: wa.businessId, weekday, startMin: 9 * 60, endMin: 17 * 60 })) });
    const r = await ingestInboundMessage({ businessId: wa.businessId, channel: "EMAIL", senderName: "Sam Rivera", senderHandle: "sam.rivera@outlook.com", clientEmail: "sam.rivera@outlook.com", subject: "Family session", body: "Hi! Could we do a family session next month? What do you charge?", providerMessageId: `par-${stamp()}` });
    a = { ...wa, conversationId: r.conversation!.id, leadId: r.lead!.id, clientId: r.client!.id, staffToken: await createSessionToken({ userId: staff.id, activeBusinessId: wa.businessId }) };
    b = wb;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: "par-" } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  it("thread tools: read state, archive, reclassify with a rule, relationship, delete — and none of it across tenants", async () => {
    const { POST } = await import("./conversations/[id]/tools/route");
    const cid = a.conversationId;
    expect((await POST(req(`/x/${cid}/tools`, b.token, json({ action: "archive", archived: true })), params(cid))).status).toBe(400);
    expect((await prisma.conversation.findUnique({ where: { id: cid } }))?.archived).toBe(false);
    expect((await POST(req(`/x/${cid}/tools`, a.token, json({ action: "read", read: true })), params(cid))).status).toBe(200);
    expect((await prisma.conversation.findUnique({ where: { id: cid } }))?.lastReadAt).not.toBeNull();
    const re = await POST(req(`/x/${cid}/tools`, a.token, json({ action: "reclassify", category: "VENDOR" })), params(cid));
    expect(re.status).toBe(200);
    expect((await prisma.conversation.findUnique({ where: { id: cid } }))?.category).toBe("VENDOR");
    expect((await POST(req(`/x/${cid}/tools`, a.token, json({ action: "reclassify", category: "PRIORITY" })), params(cid))).status).toBe(200);
    expect((await POST(req(`/x/${cid}/tools`, a.token, json({ action: "relationship", clientId: a.clientId, relationship: "CUSTOMER" })), params(cid))).status).toBe(200);
    expect((await prisma.client.findUnique({ where: { id: a.clientId } }))?.relationship).toBe("CUSTOMER");
    expect((await POST(req(`/x/${cid}/tools`, a.token, json({ action: "archive", archived: true })), params(cid))).status).toBe(200);
    expect((await POST(req(`/x/${cid}/tools`, a.token, json({ action: "archive", archived: false })), params(cid))).status).toBe(200);
  });

  it("people: a note, a relationship change, a portal invitation link — owner only for the invite", async () => {
    const notes = await import("./clients/[id]/notes/route");
    expect((await notes.POST(req(`/x`, b.token, json({ body: "not mine" })), params(a.clientId))).status).toBe(400);
    expect((await notes.POST(req(`/x`, a.token, json({ body: "Prefers Saturdays." })), params(a.clientId))).status).toBe(200);
    expect(await prisma.clientNote.count({ where: { clientId: a.clientId } })).toBe(1);
    const rel = await import("./clients/[id]/relationship/route");
    expect((await rel.POST(req(`/x`, a.token, json({ relationship: "LEAD" })), params(a.clientId))).status).toBe(200);
    const inv = await import("./clients/[id]/invite/route");
    expect((await inv.POST(req(`/x`, a.staffToken, json({})), params(a.clientId))).status).toBe(403);
    const r = await inv.POST(req(`/x`, a.token, json({})), params(a.clientId));
    expect(r.status).toBe(200);
    expect((await r.json()).link).toMatch(/\/invite\//);
  });

  it("book from the thread: slots for a day, then a real booking; reschedule and cancel go through the same actions", async () => {
    const avail = await import("./leads/[id]/availability/route");
    let day = addDays(new Date(), 7); while (day.getDay() === 0 || day.getDay() === 6) day = addDays(day, 1);
    const date = day.toISOString().slice(0, 10);
    const s = await (await avail.GET(req(`/x?date=${date}`, a.token), params(a.leadId))).json();
    expect(s.slots.length).toBeGreaterThan(0);
    const book = await import("./leads/[id]/book/route");
    const made = await book.POST(req(`/x`, a.token, json({ startISO: s.slots[0].start })), params(a.leadId));
    expect(made.status).toBe(200);
    const bookingId = (await made.json()).bookingId as string;
    expect((await prisma.lead.findUnique({ where: { id: a.leadId } }))?.status).toBe("BOOKED");
    const resch = await import("./bookings/[id]/reschedule/route");
    expect((await resch.GET(req(`/x?date=${date}`, b.token), params(bookingId))).status).toBe(400);
    const slots = await (await resch.GET(req(`/x?date=${date}`, a.token), params(bookingId))).json();
    const other = slots.slots.find((x: { start: string }) => x.start !== s.slots[0].start);
    if (other) {
      expect((await resch.POST(req(`/x`, a.token, json({ startISO: other.start, notify: false })), params(bookingId))).status).toBe(200);
      expect((await prisma.booking.findUnique({ where: { id: bookingId } }))?.startAt.toISOString()).toBe(other.start);
    }
    const q = await import("./bookings/[id]/questionnaire/route");
    expect((await q.POST(req(`/x`, b.token, json({})), params(bookingId))).status).toBe(400);
    const cancel = await import("./bookings/[id]/cancel/route");
    expect((await cancel.POST(req(`/x`, b.token, json({})), params(bookingId))).status).toBe(400);
    expect((await cancel.POST(req(`/x`, a.token, json({})), params(bookingId))).status).toBe(200);
    expect((await prisma.booking.findUnique({ where: { id: bookingId } }))?.status).toBe("CANCELED");
  });

  it("settings: services, availability, business profile, name and timezone — admin only", async () => {
    const services = await import("./services/route");
    expect((await services.PUT(req(`/x`, a.staffToken, json({ services: [{ name: "Mini", priceCents: 15000, durationMins: 30 }] }, "PUT")))).status).toBe(403);
    const cur = (await (await services.GET(req(`/x`, a.token))).json()).services;
    expect((await services.PUT(req(`/x`, a.token, json({ services: [...cur, { name: "Mini session", priceCents: 15000, durationMins: 30 }] }, "PUT")))).status).toBe(200);
    expect((await (await services.GET(req(`/x`, a.token))).json()).services.map((s: { name: string }) => s.name)).toContain("Mini session");
    const av = await import("./availability/route");
    expect((await av.PUT(req(`/x`, a.token, json({ windows: [{ weekday: 1, startMin: 600, endMin: 540 }] }, "PUT")))).status).toBe(400);
    expect((await av.PUT(req(`/x`, a.token, json({ windows: [{ weekday: 1, startMin: 540, endMin: 900 }, { weekday: 6, startMin: 600, endMin: 780 }] }, "PUT")))).status).toBe(200);
    expect((await (await av.GET(req(`/x`, a.token))).json()).windows).toHaveLength(2);
    const biz = await import("./business/route");
    expect((await biz.PUT(req(`/x`, a.token, json({ name: "Parity A Studio", bio: "Family photography.", timezone: "America/Los_Angeles", bufferMinutes: 15, bookingLeadHours: 24 }, "PUT")))).status).toBe(200);
    expect((await prisma.business.findUnique({ where: { id: a.businessId } }))?.timezone).toBe("America/Los_Angeles");
    const prof = await import("./profile/route");
    expect((await prof.PUT(req(`/x`, a.token, json({ name: "Alex Owner", workspaceName: "Parity A Studio", timezone: "America/Chicago" }, "PUT")))).status).toBe(200);
  });

  it("team: invite a teammate (link), pending invitation listed, revoke it; a staff member cannot manage the team", async () => {
    const invite = await import("./team/invite/route");
    expect((await invite.POST(req(`/x`, a.staffToken, json({ name: "Nope", email: "nope@example.net" })))).status).toBe(403);
    const r = await invite.POST(req(`/x`, a.token, json({ name: "Jamie", email: `par-jamie-${stamp()}@example.net` })));
    expect(r.status).toBe(200);
    const team = await (await (await import("./team/route")).GET(req(`/x`, a.token))).json();
    expect(team.invitations.length).toBe(1);
    const inv = await import("./team/invitations/[id]/route");
    // Another tenant's revoke is a scoped no-op: the invitation stays pending.
    await inv.POST(req(`/x`, b.token, json({ action: "revoke" })), params(team.invitations[0].id));
    expect((await prisma.invitation.findUnique({ where: { id: team.invitations[0].id } }))?.status).toBe("PENDING");
    expect((await inv.POST(req(`/x`, a.token, json({ action: "revoke" })), params(team.invitations[0].id))).status).toBe(200);
    expect((await prisma.invitation.findUnique({ where: { id: team.invitations[0].id } }))?.status).toBe("REVOKED");
  });

  it("workspaces: only memberships you hold can be switched to; the new token is scoped to that workspace", async () => {
    const ws = await import("./workspaces/route");
    const list = await (await ws.GET(req(`/x`, a.token))).json();
    expect(list.workspaces.map((w: { id: string }) => w.id)).toEqual([a.businessId]);
    expect((await ws.POST(req(`/x`, a.token, json({ businessId: b.businessId })))).status).toBe(403);
  });

  it("agent proposals: a reply proposal can be prepared and dismissed on a Pro workspace; Free is refused with the plan named", async () => {
    await prisma.lead.update({ where: { id: a.leadId } , data: { status: "NEW", respondedAt: null } });
    await prisma.conversation.update({ where: { id: a.conversationId }, data: { category: "PRIORITY", archived: false } });
    const brief = await (await (await import("./agent/route")).GET(req(`/x`, a.token))).json();
    const p = brief.proposals.find((x: { kind: string }) => x.kind === "reply");
    expect(p).toBeTruthy();
    const one = await import("./agent/[id]/route");
    const prepared = await one.GET(req(`/x`, a.token), params(encodeURIComponent(p.id)));
    expect(prepared.status).toBe(200);
    // Another tenant's dismissal is recorded only under its own workspace: A's proposal is still there.
    await one.POST(req(`/x`, b.token, json({ decision: "dismiss" })), params(encodeURIComponent(p.id)));
    expect((await (await (await import("./agent/route")).GET(req(`/x`, a.token))).json()).proposals.some((x: { id: string }) => x.id === p.id)).toBe(true);
    expect((await one.POST(req(`/x`, a.token, json({ decision: "dismiss" })), params(encodeURIComponent(p.id)))).status).toBe(200);
    expect((await (await (await import("./agent/route")).GET(req(`/x`, a.token))).json()).proposals.some((x: { id: string }) => x.id === p.id)).toBe(false);
    const free = await workspace("Parity Free", "FREE");
    expect((await (await import("./agent/route")).GET(req(`/x`, free.token))).status).toBe(403);
  });

  it("notifications, search and billing: listed and marked read; search finds the person; billing refuses without Stripe live", async () => {
    const n = await import("./notifications/route");
    const before = await (await n.GET(req(`/x`, a.token))).json();
    expect(before.notifications.length).toBeGreaterThan(0);
    expect((await n.POST(req(`/x`, a.token, json({})))).status).toBe(200);
    expect((await (await n.GET(req(`/x`, a.token))).json()).unread).toBe(0);
    const s = await import("./search/route");
    const hits = await (await s.GET(req(`/x?q=Sam`, a.token))).json();
    expect(JSON.stringify(hits)).toContain("Sam Rivera");
    const billing = await import("./billing/route");
    const r = await billing.POST(req(`/x`, a.token, json({ kind: "portal" })));
    expect([200, 400]).toContain(r.status);
  });
});
