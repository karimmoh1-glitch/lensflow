import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { summarizeConversation } from "./conversations";
import { generateDraftAction } from "./inbox";
import { AI_CALL_EVENT, recordAiCall } from "@/server/aiUsage";
import { applyCompedAccess, isCompedEmail } from "@/server/compedAccess";
import { AI_MODEL, AI_RATE_LIMITS } from "@/lib/aiPolicy";
import { effectivePlan } from "@/lib/billing";

/**
 * The guards as a caller meets them: through the real server actions, with a real session
 * and real rows. No provider is contacted — every case here is either answered from cache
 * or refused before a request would go out.
 */
const stamp = Date.now();
let businessId: string, convId: string, session: { userId: string; activeBusinessId: string };
const KEY = process.env.OPENAI_API_KEY;
const COMPED = process.env.COMPED_BUSINESS_EMAILS;

beforeAll(async () => {
  const business = await prisma.business.create({ data: { name: "AI guard co", handle: `ai-guard-${stamp}`, planTier: "BUSINESS", billingStatus: "ACTIVE" } });
  businessId = business.id;
  const owner = await prisma.user.create({ data: { name: "Guard Owner", email: `ai-guard-${stamp}@guard-fixture.invalid`, passwordHash: "x" } });
  await prisma.orgMembership.create({ data: { userId: owner.id, businessId, role: "OWNER" } });
  session = { userId: owner.id, activeBusinessId: businessId };
  const client = await prisma.client.create({ data: { businessId, name: "Guard Customer", email: `guard-customer-${stamp}@guard-fixture.invalid` } });
  const conv = await prisma.conversation.create({ data: { businessId, clientId: client.id, channel: "EMAIL", externalHandle: client.email!, lastMessageAt: new Date(Date.now() - 60_000) } });
  convId = conv.id;
  await prisma.message.create({ data: { conversationId: convId, direction: "INBOUND", body: "Do you shoot weddings in June?", createdAt: new Date(Date.now() - 60_000) } });
});

afterAll(async () => {
  await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { endsWith: "@guard-fixture.invalid" } } });
  if (KEY === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = KEY;
  if (COMPED === undefined) delete process.env.COMPED_BUSINESS_EMAILS; else process.env.COMPED_BUSINESS_EMAILS = COMPED;
});

beforeEach(async () => {
  // A key that is never used: every case below is answered or refused before a request.
  process.env.OPENAI_API_KEY = "test-key-not-used-for-any-request";
  delete process.env.AI_DISABLED;
  await prisma.analyticsEvent.deleteMany({ where: { businessId } });
});

const aiEvents = () => prisma.analyticsEvent.count({ where: { businessId, name: { in: [AI_CALL_EVENT, "ai_blocked"] } } });

describe("a cached summary never reaches the model", () => {
  it("returns the stored sentence and spends nothing", async () => {
    await prisma.conversation.update({
      where: { id: convId },
      data: { summary: { summary: "They asked about a June wedding.", source: "ai", details: [], nextStep: null } as unknown as object, summaryAt: new Date(), summarySource: "ai" },
    });
    const result = await summarizeConversation(convId, {}, session);
    expect(result.summary?.summary).toBe("They asked about a June wedding.");
    expect(result.error).toBeUndefined();
    // Neither a call nor a refusal: the cache answered before the gate was consulted.
    expect(await aiEvents()).toBe(0);
  });

  it("a forced re-summary is refused once the hourly limit is spent, and the cache still answers", async () => {
    const limit = AI_RATE_LIMITS.summary_forced!.limit;
    for (let i = 0; i < limit; i++) {
      await recordAiCall({ businessId, feature: "summary_forced", model: AI_MODEL, inputTokens: 10, outputTokens: 5, totalTokens: 15, ms: 10, ok: true });
    }
    const forced = await summarizeConversation(convId, { force: true }, session);
    expect(forced.error).toMatch(/limit for AI writing/i);
    expect(forced.summary).toBeUndefined();
    // The unforced path is untouched by that limit and still serves the cache.
    const cached = await summarizeConversation(convId, {}, session);
    expect(cached.summary).toBeDefined();
  });
});

describe("the draft action refuses before it spends", () => {
  it("says so plainly once the hourly limit is reached", async () => {
    for (let i = 0; i < AI_RATE_LIMITS.draft!.limit; i++) {
      await recordAiCall({ businessId, feature: "draft", model: AI_MODEL, inputTokens: 10, outputTokens: 5, totalTokens: 15, ms: 10, ok: true });
    }
    const result = await generateDraftAction(convId, session);
    expect(result.error).toMatch(/limit for AI writing/i);
    expect(result.text).toBeUndefined();
    expect(result.error).not.toMatch(/openai|gpt|token|api key/i);
  });

  it("still writes a draft while AI is switched off, from Daythread's own wording", async () => {
    process.env.AI_DISABLED = "true";
    const result = await generateDraftAction(convId, session);
    // The designed fallback, unchanged: the button keeps working during an incident.
    expect(result.error).toBeUndefined();
    expect(result.text).toBeTruthy();
    expect(result.text).toMatch(/Guard Customer|Hi/);
    // And the refusal is recorded, so the founder dashboard shows what was withheld.
    const blocked = await prisma.analyticsEvent.count({ where: { businessId, name: "ai_blocked" } });
    expect(blocked).toBe(1);
  });

  it("with no key at all, the draft still comes back from the template", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await generateDraftAction(convId, session);
    expect(result.error).toBeUndefined();
    expect(result.text).toBeTruthy();
  });
});

describe("complimentary access", () => {
  it("grants the plan without a subscription and without touching Stripe's fields", async () => {
    const email = `comped-${stamp}@guard-fixture.invalid`;
    const user = await prisma.user.create({ data: { name: "Comped Owner", email, passwordHash: "x" } });
    const workspace = await prisma.business.create({ data: { name: "Comped co", handle: `comped-${stamp}` } });
    await prisma.orgMembership.create({ data: { userId: user.id, businessId: workspace.id, role: "OWNER" } });

    process.env.COMPED_BUSINESS_EMAILS = ` ${email.toUpperCase()} , someone-else@example.com`;
    expect(isCompedEmail(email)).toBe(true);
    expect(isCompedEmail("nobody@example.com")).toBe(false);

    expect(await applyCompedAccess(user.id, email)).toBe(1);
    const after = await prisma.business.findUniqueOrThrow({ where: { id: workspace.id } });
    expect(after.compedPlan).toBe("BUSINESS");
    // Stripe's fields are untouched, so this workspace is never counted as revenue.
    expect(after.planTier).toBe("FREE");
    expect(after.billingStatus).toBeNull();
    expect(after.stripeSubscriptionId).toBeNull();
    // But the entitlement is real.
    expect(effectivePlan(after)).toBe("BUSINESS");

    // Idempotent, and it does nothing for an address that is not on the list.
    expect(await applyCompedAccess(user.id, email)).toBe(0);
    delete process.env.COMPED_BUSINESS_EMAILS;
    expect(await applyCompedAccess(user.id, email)).toBe(0);

    await prisma.business.delete({ where: { id: workspace.id } });
  });

  it("a lapsed paid plan still falls back to Free when nothing is comped", () => {
    expect(effectivePlan({ planTier: "PRO", billingStatus: "CANCELED", compedPlan: null })).toBe("FREE");
    expect(effectivePlan({ planTier: "FREE", billingStatus: null, compedPlan: null })).toBe("FREE");
    // A comped workspace that later subscribes keeps the higher of the two.
    expect(effectivePlan({ planTier: "PRO", billingStatus: "ACTIVE", compedPlan: "BUSINESS" })).toBe("BUSINESS");
    expect(effectivePlan({ planTier: "BUSINESS", billingStatus: "ACTIVE", compedPlan: "PRO" })).toBe("BUSINESS");
  });
});
