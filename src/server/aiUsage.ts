import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import {
  AI_BLOCK_MESSAGE,
  AI_RATE_LIMITS,
  DAILY_CALL_CEILING,
  estimateCostMicros,
  type AiBlockReason,
  type AiErrorKind,
  type AiFeature,
} from "@/lib/aiPolicy";

/**
 * What every model call costs and whether it may happen at all.
 *
 * One AnalyticsEvent row per call, named `ai_call`, carrying the feature, the model,
 * token counts, latency and an estimated cost — and never a prompt, a customer message,
 * a name or a key. Those same rows are the counters the limits are enforced from, so a
 * limit holds across every serverless instance without new infrastructure.
 *
 * Nothing here throws: a workspace must keep receiving messages and drafting replies even
 * if telemetry or a counter query fails.
 */

export const AI_CALL_EVENT = "ai_call";

/** True when AI is switched off deliberately, whatever the key says. Read per call so an incident switch takes effect on the next request. */
export function aiDisabledByFlag(): boolean {
  const flag = (process.env.AI_DISABLED ?? "").trim().toLowerCase();
  return flag === "true" || flag === "1" || flag === "yes";
}

/** True when a key is present. Says nothing about whether the key works. */
export function modelKeyConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** The state the status page reports. */
export function aiOperationalState(): "ready" | "disabled" | "not_configured" {
  if (!modelKeyConfigured()) return "not_configured";
  if (aiDisabledByFlag()) return "disabled";
  return "ready";
}

export type AiGate = { ok: true } | { ok: false; reason: AiBlockReason; message: string };

const blocked = (reason: AiBlockReason): AiGate => ({ ok: false, reason, message: AI_BLOCK_MESSAGE[reason] });

async function callsSince(businessId: string, windowMs: number, feature?: AiFeature): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  return prisma.analyticsEvent.count({
    where: {
      businessId,
      name: AI_CALL_EVENT,
      createdAt: { gte: since },
      ...(feature ? { properties: { path: ["feature"], equals: feature } } : {}),
    },
  });
}

/**
 * The one gate every model call passes: switched on, configured, under this feature's
 * limit, and under the workspace's daily ceiling. Checked before the request goes out.
 *
 * Counting is check-then-record, exactly like the rest of the codebase: a burst of
 * concurrent requests can exceed a cap by the number in flight, never by more, which is
 * the right trade for caps counted in the tens per hour. A counter that cannot be read
 * fails closed on nothing — the call proceeds — because losing a customer's draft to a
 * database hiccup is worse than one uncounted call.
 */
export async function checkAiLimit(businessId: string, feature: AiFeature): Promise<AiGate> {
  if (!modelKeyConfigured()) return blocked("not_configured");
  if (aiDisabledByFlag()) return blocked("disabled");
  try {
    const perFeature = AI_RATE_LIMITS[feature];
    if (perFeature && (await callsSince(businessId, perFeature.windowMs, feature)) >= perFeature.limit) {
      return blocked("feature_limit");
    }
    if ((await callsSince(businessId, DAILY_CALL_CEILING.windowMs)) >= DAILY_CALL_CEILING.limit) {
      return blocked("daily_limit");
    }
  } catch (err) {
    console.error("[ai] limit check failed; allowing the call", err);
  }
  return { ok: true };
}

export type AiCallOutcome = {
  businessId: string;
  feature: AiFeature;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  ms: number;
  ok: boolean;
  errorKind?: AiErrorKind | null;
};

/**
 * Records one call. Properties are numbers and fixed keys only: no prompt, no message
 * text, no customer name, no key. `costMicros` is an estimate from the published price
 * list in lib/aiPolicy.ts, and is 0 when the provider returned no usage.
 */
export async function recordAiCall(outcome: AiCallOutcome): Promise<void> {
  const inputTokens = outcome.inputTokens ?? 0;
  const outputTokens = outcome.outputTokens ?? 0;
  const totalTokens = outcome.totalTokens ?? inputTokens + outputTokens;
  await track(AI_CALL_EVENT, {
    businessId: outcome.businessId,
    properties: {
      feature: outcome.feature,
      model: outcome.model,
      inputTokens,
      outputTokens,
      totalTokens,
      costMicros: estimateCostMicros(outcome.model, inputTokens, outputTokens),
      ms: outcome.ms,
      ok: outcome.ok,
      ...(outcome.errorKind ? { errorKind: outcome.errorKind } : {}),
    },
  });
}

/** A call that never reached the provider. Recorded with no tokens and no cost, so the dashboard shows refusals next to spend. */
export async function recordAiBlocked(businessId: string, feature: AiFeature, reason: AiBlockReason): Promise<void> {
  await track("ai_blocked", { businessId, properties: { feature, reason } });
}

// ── Reporting ────────────────────────────────────────────────────────────

type Row = { properties: unknown; createdAt: Date; businessId: string | null };
type Props = { feature?: string; model?: string; inputTokens?: number; outputTokens?: number; totalTokens?: number; costMicros?: number; ms?: number; ok?: boolean; errorKind?: string };
const props = (r: Row): Props => (r.properties && typeof r.properties === "object" ? (r.properties as Props) : {});

export type AiUsageSummary = {
  callsToday: number;
  callsThisHour: number;
  tokensToday: number;
  costMicrosToday: number;
  failuresToday: number;
  blockedToday: number;
  byFeature: [string, number][];
  byErrorKind: [string, number][];
  medianMs: number | null;
  lastCallAt: Date | null;
};

function summarize(rows: Row[], blocked: number, now = new Date()): AiUsageSummary {
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const byFeature = new Map<string, number>();
  const byErrorKind = new Map<string, number>();
  let tokens = 0;
  let cost = 0;
  let failures = 0;
  let hour = 0;
  const latencies: number[] = [];
  for (const r of rows) {
    const p = props(r);
    tokens += p.totalTokens ?? 0;
    cost += p.costMicros ?? 0;
    if (p.ok === false) {
      failures += 1;
      if (p.errorKind) byErrorKind.set(p.errorKind, (byErrorKind.get(p.errorKind) ?? 0) + 1);
    }
    if (r.createdAt >= hourAgo) hour += 1;
    if (typeof p.ms === "number") latencies.push(p.ms);
    const f = p.feature ?? "unknown";
    byFeature.set(f, (byFeature.get(f) ?? 0) + 1);
  }
  latencies.sort((a, b) => a - b);
  return {
    callsToday: rows.length,
    callsThisHour: hour,
    tokensToday: tokens,
    costMicrosToday: cost,
    failuresToday: failures,
    blockedToday: blocked,
    byFeature: [...byFeature.entries()].sort((a, b) => b[1] - a[1]),
    byErrorKind: [...byErrorKind.entries()].sort((a, b) => b[1] - a[1]),
    medianMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
    lastCallAt: rows.reduce<Date | null>((latest, r) => (!latest || r.createdAt > latest ? r.createdAt : latest), null),
  };
}

/** One workspace's last 24 hours. Tenant-scoped at the query; a workspace id is the only way in. */
export async function getAiUsageForBusiness(businessId: string, now = new Date()): Promise<AiUsageSummary> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [rows, blocked] = await Promise.all([
    prisma.analyticsEvent.findMany({ where: { businessId, name: AI_CALL_EVENT, createdAt: { gte: since } }, select: { properties: true, createdAt: true, businessId: true } }),
    prisma.analyticsEvent.count({ where: { businessId, name: "ai_blocked", createdAt: { gte: since } } }),
  ]);
  return summarize(rows, blocked, now);
}

export type AiSpend = {
  state: "ready" | "disabled" | "not_configured";
  overall: AiUsageSummary;
  byBusiness: { businessId: string; name: string; handle: string; usage: AiUsageSummary }[];
};

/** Every workspace's last 24 hours, for the founder dashboard. Aggregates only. */
export async function getAiSpend(now = new Date()): Promise<AiSpend> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [rows, blockedRows] = await Promise.all([
    prisma.analyticsEvent.findMany({ where: { name: AI_CALL_EVENT, createdAt: { gte: since } }, select: { properties: true, createdAt: true, businessId: true } }),
    prisma.analyticsEvent.groupBy({ by: ["businessId"], where: { name: "ai_blocked", createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const blockedBy = new Map(blockedRows.map((b) => [b.businessId ?? "", b._count._all]));
  const grouped = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.businessId) continue;
    const list = grouped.get(r.businessId) ?? [];
    list.push(r);
    grouped.set(r.businessId, list);
  }
  const ids = [...new Set([...grouped.keys(), ...blockedBy.keys()].filter(Boolean))];
  const businesses = ids.length ? await prisma.business.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, handle: true } }) : [];
  const byBusiness = businesses
    .map((b) => ({ businessId: b.id, name: b.name, handle: b.handle, usage: summarize(grouped.get(b.id) ?? [], blockedBy.get(b.id) ?? 0, now) }))
    .sort((a, b) => b.usage.costMicrosToday - a.usage.costMicrosToday || b.usage.callsToday - a.usage.callsToday);
  return {
    state: aiOperationalState(),
    overall: summarize(rows, [...blockedBy.values()].reduce((a, b) => a + b, 0), now),
    byBusiness,
  };
}
