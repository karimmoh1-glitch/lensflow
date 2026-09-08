/**
 * Everything that governs an OpenAI call in one place: what it may cost, how long its
 * input and output may be, and how often a workspace may make one. Pure and client-safe,
 * so the same numbers drive enforcement on the server, the founder dashboard, and the
 * tests — and a pricing change is a one-line edit here, nowhere else.
 */

/** The only model Daythread calls. Changing it means changing PRICING below with it. */
export const AI_MODEL = "gpt-4o-mini";

/**
 * Published OpenAI list prices, in micro-dollars (millionths of a dollar) per million
 * tokens, so every figure stays an exact integer. gpt-4o-mini: $0.15 per million input
 * tokens, $0.60 per million output. Verify against openai.com/api/pricing when it changes;
 * an unknown model costs 0 rather than a guess, and the dashboard says the figure is an
 * estimate because cached-input and batch discounts are not modelled here.
 */
export const PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "gpt-4o-mini": { inputPerMillion: 150_000, outputPerMillion: 600_000 },
};

/** Estimated cost of one call, in micro-dollars. Unknown model or missing usage → 0. */
export function estimateCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICING[model];
  if (!price) return 0;
  const input = Math.round((inputTokens * price.inputPerMillion) / 1_000_000);
  const output = Math.round((outputTokens * price.outputPerMillion) / 1_000_000);
  return input + output;
}

/** Micro-dollars as money. Small amounts keep four decimals so a single call is visible. */
export function formatCostMicros(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars === 0) return "$0";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 1) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}

/** The five things Daythread asks a model to do. One key per call site. */
export type AiFeature = "extraction" | "draft" | "agent_draft" | "assistant" | "summary" | "summary_forced";

export const AI_FEATURE_LABEL: Record<AiFeature, string> = {
  extraction: "Reading an inbound message",
  draft: "Drafting a reply",
  agent_draft: "Drafting an assistant proposal",
  assistant: "Answering a question",
  summary: "Summarizing a thread",
  summary_forced: "Re-summarizing a thread",
};

/**
 * Output ceilings. Every call sets one, so a single request can never bill the model's
 * full 16k output. Each is comfortably above what its prompt asks for.
 */
export const MAX_TOKENS: Record<AiFeature, number> = {
  extraction: 200, // a JSON object of six fields is ~60
  draft: 300, // the prompt asks for under 80 words
  agent_draft: 300,
  assistant: 500, // a few sentences or a short list
  summary: 100, // one sentence, max 30 words
  summary_forced: 100,
};

/** Longest customer text handed to a model. Above a real inquiry, below an 8 KB email body. */
export const AI_INPUT_CHAR_LIMIT = 6_000;

const TRUNCATION_MARKER = "\n[…]\n";

/**
 * Keeps the head and the tail of an over-long message and drops the middle, because the
 * ask is usually at the top and the date, budget or sign-off is usually at the bottom;
 * cutting only the end would lose half of what extraction looks for. Deterministic: the
 * same input always yields the same output, exactly `max` characters long.
 */
export function truncateForModel(text: string, max: number = AI_INPUT_CHAR_LIMIT): string {
  const value = text ?? "";
  if (max <= TRUNCATION_MARKER.length) return value.slice(0, Math.max(0, max));
  if (value.length <= max) return value;
  const room = max - TRUNCATION_MARKER.length;
  const head = Math.ceil(room * 0.6);
  const tail = room - head;
  return value.slice(0, head) + TRUNCATION_MARKER + (tail > 0 ? value.slice(value.length - tail) : "");
}

/**
 * Per-workspace ceilings, enforced server-side before any request goes out. Counted from
 * the recorded calls themselves, so they hold across serverless instances and regions.
 *
 * A feature with no entry here is bounded only by DAILY_CALL_CEILING: `summary` is the
 * one such case, and it is already bounded by the cache, which serves an unchanged thread
 * without a model call at all.
 */
export const AI_RATE_LIMITS: Partial<Record<AiFeature, { limit: number; windowMs: number }>> = {
  draft: { limit: 60, windowMs: 60 * 60 * 1000 },
  agent_draft: { limit: 30, windowMs: 60 * 60 * 1000 },
  summary_forced: { limit: 30, windowMs: 60 * 60 * 1000 },
  extraction: { limit: 200, windowMs: 24 * 60 * 60 * 1000 },
};

/** The backstop across every feature, including ones with no limit of their own. */
export const DAILY_CALL_CEILING = { limit: 500, windowMs: 24 * 60 * 60 * 1000 };

/** The assistant's own hourly cap, enforced in the copilot action on its own counter. */
export const ASSISTANT_HOURLY_LIMIT = 40;

/** Why a call was refused. Never shown to a customer verbatim; see AI_BLOCK_MESSAGE. */
export type AiBlockReason = "disabled" | "not_configured" | "feature_limit" | "daily_limit";

/** How a call ended, when it did not succeed. Recorded, and used to explain ops failures. */
export type AiErrorKind =
  | "auth"
  | "provider_rate_limit"
  | "timeout"
  | "provider_error"
  | "bad_response"
  | "internal";

/**
 * A refusal worth telling someone about. A missing key or a deliberate switch-off is not:
 * those fall through to Daythread's own wording, which is the designed behaviour and looks
 * the same to the person as it always has. Being throttled is, because the alternative is
 * a template that silently pretends to be the model's work.
 */
export function isSpendLimit(reason: AiBlockReason): boolean {
  return reason === "feature_limit" || reason === "daily_limit";
}

/**
 * What the person sees. Says what happened and what to expect next, without naming a
 * provider, a limit's internals, or anything an attacker could probe with.
 */
export const AI_BLOCK_MESSAGE: Record<AiBlockReason, string> = {
  disabled: "AI writing is switched off right now. Everything else works, and drafts and summaries fall back to Daythread's own wording.",
  not_configured: "AI writing isn't switched on for this deployment. Drafts and summaries come from Daythread's own wording instead.",
  feature_limit: "You've reached this workspace's limit for AI writing right now. It frees up shortly, and nothing was lost.",
  daily_limit: "This workspace has reached today's AI limit. It resets tomorrow; the inbox, calendar, bookings and automations are unaffected.",
};
