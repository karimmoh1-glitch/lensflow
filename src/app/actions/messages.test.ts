import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { summarizeMessage } from "./messages";
import { AI_CALL_EVENT, recordAiCall } from "@/server/aiUsage";
import { AI_MODEL, AI_RATE_LIMITS } from "@/lib/aiPolicy";

/**
 * The summary as a caller meets it: through the real action, with a real session and rows.
 * No provider is contacted — with no key it falls to the rules; with a key and a spent
 * limit it is refused before a request; and a cached row answers without either.
 */
const stamp = Date.now();
let a: string, b: string, aSession: { userId: string; activeBusinessId: string }, bSession: { userId: string; activeBusinessId: string }, messageId: string;
const KEY = process.env.OPENAI_API_KEY;

beforeAll(async () => {
  const mk = async (tag: string) => {
    const biz = await prisma.business.create({ data: { name: `Summary ${tag}`, handle: `summary-${tag}-${stamp}`, planTier: "PRO", billingStatus: "ACTIVE" } });
    const owner = await prisma.user.create({ data: { name: `${tag} owner`, email: `summary-${tag}-${stamp}@summary-fixture.invalid`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: owner.id, businessId: biz.id, role: "OWNER" } });
    return { biz, session: { userId: owner.id, activeBusinessId: biz.id } };
  };
  const A = await mk("a"); const B = await mk("b");
  a = A.biz.id; b = B.biz.id; aSession = A.session; bSession = B.session;
  const client = await prisma.client.create({ data: { businessId: a, name: "Sarah Johnson", email: `sarah-${stamp}@summary-fixture.invalid` } });
  const conv = await prisma.conversation.create({ data: { businessId: a, clientId: client.id, channel: "EMAIL", externalHandle: client.email!, category: "PRIORITY" } });
  const m = await prisma.message.create({ data: { conversationId: conv.id, direction: "INBOUND", body: "Hey! We're looking for family portraits sometime in October at Marymoor Park around sunset. Our budget is around $500. Are you available?\n\nOn Sun, Aug 30, 2026 at 4:35 PM Studio <s@x.com>\nwrote:\n\n> earlier" } });
  messageId = m.id;
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [a, b] } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@summary-fixture.invalid" } } });
  if (KEY === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = KEY;
});
beforeEach(async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_DISABLED;
  await prisma.message.update({ where: { id: messageId }, data: { summary: null, summaryAt: null, summarySource: null } });
  await prisma.analyticsEvent.deleteMany({ where: { businessId: { in: [a, b] } } });
});

describe("summarizeMessage", () => {
  it("with no model it answers from the rules, from the cleaned message only, and caches it", async () => {
    const r = await summarizeMessage(messageId, aSession);
    expect(r.error).toBeUndefined();
    expect(r.source).toBe("rules");
    expect(r.cached).toBe(false);
    expect(r.summary).toContain("family portraits");
    expect(r.summary).toContain("$500");
    // The quoted history never reaches the summary.
    expect(r.summary).not.toMatch(/wrote:|earlier/);
    const row = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
    expect(row.summary).toBe(r.summary);
    expect(row.summarySource).toBe("rules");
    const names = (await prisma.analyticsEvent.findMany({ where: { businessId: a }, select: { name: true, properties: true } }));
    expect(names.map((e) => e.name).sort()).toEqual(["message_summary_completed", "message_summary_requested"]);
    // No content in analytics.
    expect(JSON.stringify(names)).not.toMatch(/Marymoor|\$500|Sarah/);
  });

  it("a second click is answered from the cache with no event and no call", async () => {
    await summarizeMessage(messageId, aSession);
    await prisma.analyticsEvent.deleteMany({ where: { businessId: a } });
    const again = await summarizeMessage(messageId, aSession);
    expect(again.cached).toBe(true);
    expect(again.summary).toBeTruthy();
    expect(await prisma.analyticsEvent.count({ where: { businessId: a } })).toBe(0);
  });

  it("with a key but the hourly limit spent, it refuses plainly before any request", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-used-for-any-request";
    for (let i = 0; i < AI_RATE_LIMITS.message_summary!.limit; i++) {
      await recordAiCall({ businessId: a, feature: "message_summary", model: AI_MODEL, inputTokens: 10, outputTokens: 5, totalTokens: 15, ms: 10, ok: true });
    }
    const r = await summarizeMessage(messageId, aSession);
    expect(r.error).toMatch(/limit for AI writing/i);
    expect(r.summary).toBeUndefined();
    expect(await prisma.analyticsEvent.count({ where: { businessId: a, name: "message_summary_failed" } })).toBe(1);
    expect(await prisma.analyticsEvent.count({ where: { businessId: a, name: AI_CALL_EVENT, createdAt: { gte: new Date(Date.now() - 5000) } } })).toBe(AI_RATE_LIMITS.message_summary!.limit);
  });

  it("another workspace cannot summarize, read or cache this message", async () => {
    const r = await summarizeMessage(messageId, bSession);
    expect(r.error).toMatch(/isn't here/);
    expect(r.summary).toBeUndefined();
    expect((await prisma.message.findUniqueOrThrow({ where: { id: messageId } })).summary).toBeNull();
    expect(await prisma.analyticsEvent.count({ where: { businessId: b } })).toBe(0);
  });
});
