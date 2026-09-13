import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { AI_CALL_EVENT, aiDisabledByFlag, aiOperationalState, checkAiLimit, getAiSpend, getAiUsageForBusiness, modelKeyConfigured, recordAiBlocked, recordAiCall, resetAiBudgetCache, reserveAiCall, completeAiCall, AI_MAX_IN_FLIGHT } from "./aiUsage";
import { AI_MODEL, DAILY_CALL_CEILING, estimateCostMicros, type AiFeature } from "@/lib/aiPolicy";

let a: string, b: string;
const KEY = process.env.OPENAI_API_KEY;
const FLAG = process.env.AI_DISABLED;

/** Records `count` calls without touching a provider, so the counters the limits read are real rows. */
async function seedCalls(businessId: string, feature: AiFeature, count: number) {
  for (let i = 0; i < count; i++) {
    await recordAiCall({ businessId, feature, model: AI_MODEL, inputTokens: 100, outputTokens: 20, totalTokens: 120, ms: 400, ok: true });
  }
}

beforeAll(async () => {
  a = (await prisma.business.create({ data: { name: "AI usage A", handle: `ai-usage-a-${Date.now()}` } })).id;
  b = (await prisma.business.create({ data: { name: "AI usage B", handle: `ai-usage-b-${Date.now()}` } })).id;
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [a, b] } } });
  if (KEY === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = KEY;
  if (FLAG === undefined) delete process.env.AI_DISABLED; else process.env.AI_DISABLED = FLAG;
});
const BUDGET_ENV = ["AI_ENABLED", "AI_GLOBAL_DAILY_BUDGET_USD", "AI_GLOBAL_MONTHLY_BUDGET_USD", "AI_WORKSPACE_MONTHLY_BUDGET_FREE_USD", "AI_WORKSPACE_MONTHLY_BUDGET_PRO_USD"];
beforeEach(async () => {
  process.env.OPENAI_API_KEY = "test-key-not-used-for-any-request";
  delete process.env.AI_DISABLED;
  for (const k of BUDGET_ENV) delete process.env[k];
  resetAiBudgetCache();
  await prisma.analyticsEvent.deleteMany({ where: { businessId: { in: [a, b] } } });
});
afterEach(() => {
  delete process.env.AI_DISABLED;
});

describe("configuration and the kill switch", () => {
  it("no key means no call, whatever the limits say", async () => {
    delete process.env.OPENAI_API_KEY;
    expect(modelKeyConfigured()).toBe(false);
    expect(aiOperationalState()).toBe("not_configured");
    const gate = await checkAiLimit(a, "draft");
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toBe("not_configured");
      expect(gate.message).toMatch(/Daythread's own wording/);
    }
  });

  it("AI_DISABLED refuses every call while the key stays in place", async () => {
    for (const value of ["true", "1", "yes", "TRUE"]) {
      process.env.AI_DISABLED = value;
      expect(aiDisabledByFlag()).toBe(true);
      expect(aiOperationalState()).toBe("disabled");
      const gate = await checkAiLimit(a, "extraction");
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.reason).toBe("disabled");
    }
    expect(modelKeyConfigured()).toBe(true);
  });

  it("absent or false leaves current behaviour alone", async () => {
    expect(aiDisabledByFlag()).toBe(false);
    process.env.AI_DISABLED = "false";
    expect(aiDisabledByFlag()).toBe(false);
    expect(aiOperationalState()).toBe("ready");
    expect((await checkAiLimit(a, "draft")).ok).toBe(true);
  });

  it("the message never names the provider or the limit's internals", async () => {
    process.env.AI_DISABLED = "true";
    const gate = await checkAiLimit(a, "draft");
    if (gate.ok) throw new Error("expected a refusal");
    expect(gate.message).not.toMatch(/openai|gpt|token|api|key/i);
  });
});

describe("per-feature limits", () => {
  it("drafts stop at 60 an hour and nothing else is affected", async () => {
    await seedCalls(a, "draft", 59);
    expect((await checkAiLimit(a, "draft")).ok).toBe(true);
    await seedCalls(a, "draft", 1);
    const gate = await checkAiLimit(a, "draft");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("feature_limit");
    // A different feature keeps its own allowance.
    expect((await checkAiLimit(a, "assistant")).ok).toBe(true);
    expect((await checkAiLimit(a, "summary")).ok).toBe(true);
  });

  it("agent drafts stop at 30 an hour", async () => {
    await seedCalls(a, "agent_draft", 30);
    expect((await checkAiLimit(a, "agent_draft")).ok).toBe(false);
    expect((await checkAiLimit(a, "draft")).ok).toBe(true);
  });

  it("forced re-summaries stop at 30 an hour, and an uncached summary is not counted with them", async () => {
    await seedCalls(a, "summary_forced", 30);
    expect((await checkAiLimit(a, "summary_forced")).ok).toBe(false);
    expect((await checkAiLimit(a, "summary")).ok).toBe(true);
  });

  it("message reading stops at 200 a day", async () => {
    await seedCalls(a, "extraction", 199);
    expect((await checkAiLimit(a, "extraction")).ok).toBe(true);
    await seedCalls(a, "extraction", 1);
    expect((await checkAiLimit(a, "extraction")).ok).toBe(false);
  });

  it("an hourly window forgets calls older than an hour", async () => {
    await seedCalls(a, "draft", 60);
    expect((await checkAiLimit(a, "draft")).ok).toBe(false);
    await prisma.analyticsEvent.updateMany({ where: { businessId: a, name: AI_CALL_EVENT }, data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    expect((await checkAiLimit(a, "draft")).ok).toBe(true);
  });
});

describe("the daily backstop", () => {
  it("stops every feature once the workspace has made 500 calls in a day", async () => {
    // Spread across features so no per-feature limit is what refuses.
    await seedCalls(a, "summary", DAILY_CALL_CEILING.limit);
    for (const feature of ["draft", "assistant", "summary", "extraction"] as AiFeature[]) {
      const gate = await checkAiLimit(a, feature);
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.reason).toBe("daily_limit");
    }
  });

  it("counts failed and successful calls alike, so forcing errors buys nothing", async () => {
    for (let i = 0; i < DAILY_CALL_CEILING.limit; i++) {
      await recordAiCall({ businessId: a, feature: "summary", model: AI_MODEL, ms: 10, ok: false, errorKind: "provider_error" });
    }
    expect((await checkAiLimit(a, "summary")).ok).toBe(false);
  });
});

describe("tenant isolation", () => {
  it("one workspace's usage never limits or appears in another's", async () => {
    await seedCalls(a, "draft", 60);
    expect((await checkAiLimit(a, "draft")).ok).toBe(false);
    expect((await checkAiLimit(b, "draft")).ok).toBe(true);

    const usageA = await getAiUsageForBusiness(a);
    const usageB = await getAiUsageForBusiness(b);
    expect(usageA.callsToday).toBe(60);
    expect(usageB.callsToday).toBe(0);
    expect(usageB.costMicrosToday).toBe(0);
  });
});

describe("what a call records", () => {
  it("a success carries tokens, latency and an estimated cost, and no customer text", async () => {
    await recordAiCall({ businessId: a, feature: "draft", model: AI_MODEL, inputTokens: 1_000, outputTokens: 200, totalTokens: 1_200, ms: 850, ok: true });
    const row = await prisma.analyticsEvent.findFirstOrThrow({ where: { businessId: a, name: AI_CALL_EVENT } });
    const p = row.properties as Record<string, unknown>;
    expect(p).toMatchObject({ feature: "draft", model: AI_MODEL, inputTokens: 1_000, outputTokens: 200, totalTokens: 1_200, ms: 850, ok: true });
    expect(p.costMicros).toBe(estimateCostMicros(AI_MODEL, 1_000, 200));
    // Only these keys, ever: no prompt, no message, no name, no key.
    expect(Object.keys(p).sort()).toEqual(["costMicros", "feature", "inputTokens", "model", "ms", "ok", "outputTokens", "totalTokens"]);
  });

  it("a failure records its kind and costs nothing", async () => {
    await recordAiCall({ businessId: a, feature: "assistant", model: AI_MODEL, ms: 20_000, ok: false, errorKind: "timeout" });
    const row = await prisma.analyticsEvent.findFirstOrThrow({ where: { businessId: a, name: AI_CALL_EVENT } });
    const p = row.properties as Record<string, unknown>;
    expect(p.ok).toBe(false);
    expect(p.errorKind).toBe("timeout");
    expect(p.costMicros).toBe(0);
    expect(p.totalTokens).toBe(0);
  });

  it("a refusal is recorded apart from spend", async () => {
    await recordAiBlocked(a, "draft", "feature_limit");
    const usage = await getAiUsageForBusiness(a);
    expect(usage.blockedToday).toBe(1);
    expect(usage.callsToday).toBe(0);
  });

  it("the summary adds up what happened", async () => {
    await recordAiCall({ businessId: a, feature: "draft", model: AI_MODEL, inputTokens: 500, outputTokens: 100, totalTokens: 600, ms: 300, ok: true });
    await recordAiCall({ businessId: a, feature: "draft", model: AI_MODEL, inputTokens: 500, outputTokens: 100, totalTokens: 600, ms: 700, ok: true });
    await recordAiCall({ businessId: a, feature: "extraction", model: AI_MODEL, ms: 100, ok: false, errorKind: "auth" });
    const usage = await getAiUsageForBusiness(a);
    expect(usage.callsToday).toBe(3);
    expect(usage.callsThisHour).toBe(3);
    expect(usage.tokensToday).toBe(1_200);
    expect(usage.failuresToday).toBe(1);
    expect(usage.byErrorKind).toEqual([["auth", 1]]);
    expect(usage.byFeature).toEqual([["draft", 2], ["extraction", 1]]);
    expect(usage.costMicrosToday).toBe(2 * estimateCostMicros(AI_MODEL, 500, 100));
    expect(usage.medianMs).not.toBeNull();
    expect(usage.lastCallAt).toBeInstanceOf(Date);
  });

  it("the founder view groups by workspace and reports the operational state", async () => {
    await seedCalls(a, "draft", 2);
    await seedCalls(b, "assistant", 1);
    const spend = await getAiSpend();
    expect(spend.state).toBe("ready");
    const rowA = spend.byBusiness.find((r) => r.businessId === a);
    const rowB = spend.byBusiness.find((r) => r.businessId === b);
    expect(rowA?.usage.callsToday).toBe(2);
    expect(rowB?.usage.callsToday).toBe(1);
    expect(spend.overall.callsToday).toBeGreaterThanOrEqual(3);
  });
});

describe("cost ceilings, the per-person limit and the AI_ENABLED switch", () => {
  afterEach(() => {
    for (const k of BUDGET_ENV) delete process.env[k];
    resetAiBudgetCache();
  });

  it("AI_ENABLED=false is a server-side kill switch; any other value leaves AI on", async () => {
    for (const value of ["false", "0", "no", "off", "FALSE"]) {
      process.env.AI_ENABLED = value;
      expect(aiDisabledByFlag()).toBe(true);
      const gate = await checkAiLimit(a, "draft");
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.reason).toBe("disabled");
    }
    for (const value of ["true", "", "1"]) {
      process.env.AI_ENABLED = value;
      expect(aiDisabledByFlag()).toBe(false);
    }
  });

  it("the global daily budget stops every workspace once Daythread as a whole has spent it", async () => {
    await seedCalls(a, "draft", 1);
    process.env.AI_GLOBAL_DAILY_BUDGET_USD = "0.000001"; // one micro-dollar: already exceeded
    resetAiBudgetCache();
    for (const id of [a, b]) {
      const gate = await checkAiLimit(id, "draft");
      expect(gate.ok).toBe(false);
      if (!gate.ok) {
        expect(gate.reason).toBe("global_budget");
        expect(gate.message).not.toMatch(/openai|budget|\$/i);
      }
    }
  });

  it("a workspace's monthly allowance follows its plan", async () => {
    // Twenty calls at ~27 micro-dollars each is ~540: over a $0.0005 Free allowance, under a $1 Pro one.
    await seedCalls(a, "summary", 20);
    process.env.AI_WORKSPACE_MONTHLY_BUDGET_FREE_USD = "0.0005";
    process.env.AI_WORKSPACE_MONTHLY_BUDGET_PRO_USD = "1";
    const gate = await checkAiLimit(a, "summary");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("workspace_budget");
    expect((await checkAiLimit(b, "summary")).ok).toBe(true);
    await prisma.business.update({ where: { id: a }, data: { betaProEndsAt: new Date(Date.now() + 86400_000) } });
    expect((await checkAiLimit(a, "summary")).ok).toBe(true);
    await prisma.business.update({ where: { id: a }, data: { betaProEndsAt: null } });
  });

  it("one person is limited across workspaces, and another person in the same workspace is not", async () => {
    const userId = `user-${Date.now()}`;
    for (let i = 0; i < 80; i++) {
      await recordAiCall({ businessId: i % 2 ? a : b, userId, feature: "summary", model: AI_MODEL, inputTokens: 1, outputTokens: 1, totalTokens: 2, ms: 1, ok: true });
    }
    const gate = await checkAiLimit(a, "summary", userId);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("user_limit");
    expect((await checkAiLimit(a, "summary", `${userId}-other`)).ok).toBe(true);
  });

  it("an unknown workspace is refused rather than allowed unmetered", async () => {
    const gate = await checkAiLimit("no-such-business", "draft");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("check_failed");
  });

  it("a recorded call carries who caused it, and still no customer text", async () => {
    await recordAiCall({ businessId: a, userId: "u-123", feature: "draft", model: AI_MODEL, inputTokens: 10, outputTokens: 5, totalTokens: 15, ms: 3, ok: true });
    const row = await prisma.analyticsEvent.findFirst({ where: { businessId: a, name: AI_CALL_EVENT }, orderBy: { createdAt: "desc" } });
    expect(row?.properties).toMatchObject({ userId: "u-123", feature: "draft" });
    expect(Object.keys(row?.properties as object).sort()).toEqual(["costMicros", "feature", "inputTokens", "model", "ms", "ok", "outputTokens", "totalTokens", "userId"]);
  });
});

describe("reservation: simultaneous requests can't all slip past the limits", () => {
  it("a burst gets at most the in-flight allowance, and a completed call frees its slot", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => reserveAiCall({ businessId: a, feature: "draft", model: AI_MODEL })));
    const granted = results.filter((r): r is { ok: true; id: string } => r.ok);
    expect(granted).toHaveLength(AI_MAX_IN_FLIGHT);
    for (const r of results) if (!r.ok) expect(r.reason).toBe("feature_limit");
    await completeAiCall(granted[0].id, { businessId: a, feature: "draft", model: AI_MODEL, inputTokens: 10, outputTokens: 5, ms: 10, ok: true });
    const again = await reserveAiCall({ businessId: a, feature: "draft", model: AI_MODEL });
    expect(again.ok).toBe(true);
    const row = await prisma.analyticsEvent.findUniqueOrThrow({ where: { id: granted[0].id } });
    expect(row.properties).toMatchObject({ ok: true, inputTokens: 10 });
    expect((row.properties as { pending?: boolean }).pending).toBeUndefined();
  });

  it("the hourly draft cap holds exactly under a burst, because every reservation counts at once", async () => {
    await seedCalls(a, "draft", 58);
    const results = await Promise.all(Array.from({ length: 10 }, () => reserveAiCall({ businessId: a, feature: "draft", model: AI_MODEL })));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
  });

  it("the provider's dated model name is priced, not recorded as free", () => {
    expect(estimateCostMicros("gpt-4o-mini-2024-07-18", 1_000_000, 0)).toBe(150_000);
  });
});
