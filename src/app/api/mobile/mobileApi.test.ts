import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";
import { ingestInboundMessage } from "@/server/leadIngestion";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "198.51.100.7" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

/**
 * The app's API, against the real database: a bearer token resolves to one workspace and
 * nothing else; every id-taking route refuses another tenant's ids; the shapes the screens
 * render are the ones the routes return. Same helpers the web dashboard uses underneath.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const req = (path: string, token: string | null, init: RequestInit = {}) => new Request(`http://localhost${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("mobile API", () => {
  const ids: string[] = [];
  let a: { businessId: string; token: string; conversationId: string; leadId: string; clientId: string; membershipId: string };
  let b: { businessId: string; token: string };

  async function workspace(name: string) {
    const s = stamp();
    const biz = await prisma.business.create({ data: { name, handle: `m-${s}`, timezone: "America/Chicago", planTier: "PRO", billingStatus: "ACTIVE" } });
    const user = await prisma.user.create({ data: { name: `${name} Owner`, email: `m-${s}@example.com`, passwordHash: "x" } });
    const m = await prisma.orgMembership.create({ data: { userId: user.id, businessId: biz.id, role: "OWNER" } });
    ids.push(biz.id);
    return { businessId: biz.id, membershipId: m.id, token: await createSessionToken({ userId: user.id, activeBusinessId: biz.id }) };
  }

  beforeAll(async () => {
    const wa = await workspace("Alpha Photo");
    const wb = await workspace("Beta Photo");
    await prisma.service.create({ data: { businessId: wa.businessId, name: "Family session", priceCents: 35000, durationMins: 60 } });
    const r = await ingestInboundMessage({ businessId: wa.businessId, channel: "EMAIL", senderName: "Sarah Johnson", senderHandle: "sarah.j@outlook.com", clientEmail: "sarah.j@outlook.com", subject: "Family session?", body: "Hi! Are you available September 14 for a family session in Redmond? Budget is around $500.", providerMessageId: `msg-${stamp()}` });
    await ingestInboundMessage({ businessId: wa.businessId, channel: "EMAIL", senderName: "DoorDash", senderHandle: "no-reply@doordash.com", clientEmail: "no-reply@doordash.com", subject: "Your order is on its way", body: "Your order from Thai Basil is on the way. Track it here: https://doordash.com/x/abc", providerMessageId: `msg-${stamp()}`, headers: { listUnsubscribe: "<https://doordash.com/u>" } });
    a = { ...wa, conversationId: r.conversation!.id, leadId: r.lead!.id, clientId: r.client!.id };
    b = wb;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: "m-" }, orgMemberships: { some: { businessId: { in: ids } } } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });

  it("no token, bad token: 401 everywhere", async () => {
    const { GET } = await import("./today/route");
    expect((await GET(req("/api/mobile/today", null))).status).toBe(401);
    expect((await GET(req("/api/mobile/today", "not-a-token"))).status).toBe(401);
  });

  it("Today: the next-action engine's list, from the record", async () => {
    const { GET } = await import("./today/route");
    const res = await GET(req("/api/mobile/today", a.token));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.next[0]).toMatchObject({ kind: "reply", headline: "Sarah needs your reply", stage: "New inquiry" });
    expect(json.next[0].value).toMatchObject({ known: true, label: "Their budget: $500" });
    expect(json.next[0].draftMode).toBe("reply");
    expect(json.today).toEqual([]);
  });

  it("Inbox: Priority holds the person, not DoorDash; All holds both, with the reason in words", async () => {
    const { GET } = await import("./conversations/route");
    const p = await (await GET(req("/api/mobile/conversations?view=priority", a.token))).json();
    expect(p.rows.map((r: { name: string }) => r.name)).toEqual(["Sarah Johnson"]);
    expect(p.rows[0]).toMatchObject({ waiting: true, label: "Potential client" });
    expect(p.rows[0].reason).toMatch(/waiting for your reply/);
    const all = await (await GET(req("/api/mobile/conversations?view=all", a.token))).json();
    expect(all.counts).toMatchObject({ priority: 1, all: 2, waiting: 1 });
    const q = await (await GET(req("/api/mobile/conversations?view=all&q=thai", a.token))).json();
    expect(q.rows).toHaveLength(1);
    expect(q.rows[0].category).toBe("AUTOMATED");
  });

  it("Thread: cleaned messages, the facts, where things stand; another tenant gets 404", async () => {
    const { GET } = await import("./conversations/[id]/route");
    const res = await GET(req(`/api/mobile/conversations/${a.conversationId}`, a.token), params(a.conversationId));
    expect(res.status).toBe(200);
    const t = await res.json();
    expect(t.name).toBe("Sarah Johnson");
    expect(t.messages[0].text).toContain("family session");
    expect(t.facts).toEqual(expect.arrayContaining([{ label: "Service", value: "Family session" }, { label: "Budget", value: "$500" }]));
    expect(t.relationship.label).toBeTruthy();
    expect((await GET(req(`/api/mobile/conversations/${a.conversationId}`, b.token), params(a.conversationId))).status).toBe(404);
  });

  it("Draft, follow-up, stage, handled: written through the same actions as the web, and refused across tenants", async () => {
    const draft = await import("./conversations/[id]/draft/route");
    const d = await draft.POST(req(`/api/mobile/conversations/${a.conversationId}/draft`, a.token, { method: "POST", body: JSON.stringify({ mode: "send_pricing" }) }), params(a.conversationId));
    expect(d.status).toBe(200);
    const dj = await d.json();
    expect(typeof dj.text).toBe("string");
    expect(dj.text).toMatch(/Family session|\$350/);

    const fu = await import("./leads/[id]/follow-up/route");
    const at = new Date(Date.now() + 86400000).toISOString();
    expect((await fu.POST(req(`/api/mobile/leads/${a.leadId}/follow-up`, a.token, { method: "POST", body: JSON.stringify({ at }) }), params(a.leadId))).status).toBe(200);
    expect((await prisma.lead.findUnique({ where: { id: a.leadId } }))?.followUpAt).not.toBeNull();
    expect((await fu.POST(req(`/api/mobile/leads/${a.leadId}/follow-up`, b.token, { method: "POST", body: JSON.stringify({ at }) }), params(a.leadId))).status).toBe(400);

    const st = await import("./leads/[id]/status/route");
    expect((await st.POST(req(`/api/mobile/leads/${a.leadId}/status`, b.token, { method: "POST", body: JSON.stringify({ status: "LOST" }) }), params(a.leadId))).status).toBe(400);
    expect((await prisma.lead.findUnique({ where: { id: a.leadId } }))?.status).toBe("NEW");
    expect((await st.POST(req(`/api/mobile/leads/${a.leadId}/status`, a.token, { method: "POST", body: JSON.stringify({ status: "BOOKED" }) }), params(a.leadId))).status).toBe(400);

    const handled = await import("./leads/[id]/handled/route");
    expect((await handled.POST(req(`/api/mobile/leads/${a.leadId}/handled`, a.token, { method: "POST" }), params(a.leadId))).status).toBe(200);
    expect((await prisma.lead.findUnique({ where: { id: a.leadId } }))?.respondedAt).not.toBeNull();
  });

  it("People: the person is listed, DoorDash is not; the profile has a timeline; another tenant gets 404", async () => {
    const list = await import("./clients/route");
    const people = (await (await list.GET(req("/api/mobile/clients", a.token))).json()).people;
    expect(people.map((p: { name: string }) => p.name)).toEqual(["Sarah Johnson"]);
    const one = await import("./clients/[id]/route");
    const res = await one.GET(req(`/api/mobile/clients/${a.clientId}`, a.token), params(a.clientId));
    expect(res.status).toBe(200);
    const p = await res.json();
    expect(p.timeline.length).toBeGreaterThan(0);
    expect(p.standing.label).toBeTruthy();
    expect((await one.GET(req(`/api/mobile/clients/${a.clientId}`, b.token), params(a.clientId))).status).toBe(404);
  });

  it("Assistant answers from the record; memory round-trips; push tokens are validated", async () => {
    const ask = await import("./assistant/route");
    const ans = await (await ask.POST(req("/api/mobile/assistant", a.token, { method: "POST", body: JSON.stringify({ question: "What is my biggest opportunity right now?" }) }))).json();
    expect(ans.answer).toMatch(/Sarah Johnson — Their budget: \$500/);
    const mem = await import("./memory/route");
    expect((await mem.PUT(req("/api/mobile/memory", a.token, { method: "PUT", body: JSON.stringify({ tone: "warm", about: "Family and newborn photography in Redmond.", locations: "", booking: "", policies: "48 hours notice to reschedule.", faqs: "" }) }))).status).toBe(200);
    const got = await (await mem.GET(req("/api/mobile/memory", a.token))).json();
    expect(got.memory.policies).toBe("48 hours notice to reschedule.");
    const push = await import("./push/route");
    expect((await push.POST(req("/api/mobile/push", a.token, { method: "POST", body: JSON.stringify({ token: "garbage-token-value" }) }))).status).toBe(400);
    expect((await push.POST(req("/api/mobile/push", a.token, { method: "POST", body: JSON.stringify({ token: "ExponentPushToken[abcdefghijklmnop]" }) }))).status).toBe(200);
    expect((await prisma.orgMembership.findUnique({ where: { id: a.membershipId } }))?.pushTokens).toEqual(["ExponentPushToken[abcdefghijklmnop]"]);
  });

  it("Subscription and team reflect the record; the calendar needs a real date", async () => {
    const sub = await import("./subscription/route");
    const s = await (await sub.GET(req("/api/mobile/subscription", a.token))).json();
    expect(s).toMatchObject({ plan: "PRO", planName: "Pro", billingStatus: "ACTIVE", canManage: true });
    const team = await import("./team/route");
    const t = await (await team.GET(req("/api/mobile/team", a.token))).json();
    expect(t.members).toHaveLength(1);
    const cal = await import("./calendar/route");
    expect((await cal.GET(req("/api/mobile/calendar?date=nope", a.token))).status).toBe(400);
    expect((await cal.GET(req("/api/mobile/calendar?date=2026-09-14", a.token))).status).toBe(200);
  });
});
