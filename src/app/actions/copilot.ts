"use server";

import { requireRole, type SessionPayload } from "@/lib/auth";
import { planLimits, PLANS, effectivePlan } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import { startOfDay } from "date-fns";
import { gatherBusinessFacts } from "@/server/copilotFacts";
import { summarizeCopilotAnswer } from "@/lib/ai";
import { ASSISTANT_HOURLY_LIMIT } from "@/lib/aiPolicy";
import { answerFromRecords } from "@/lib/copilotAnswer";
import { dbRateLimit } from "@/lib/dbRateLimit";

export async function askCopilot(question: string, session?: SessionPayload | null): Promise<string> {
  // Bounded input: a question is a sentence or two, not a document to smuggle instructions in.
  question = String(question ?? "").trim().slice(0, 500);
  if (!question) return "Ask about your conversations, bookings, calendar or customers.";
  // Facts include every customer's status — a client or partner asking must never be able
  // to see the rest of the workspace's business.
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  // Free gets a limited copilot: a handful of questions a day, counted in the database
  // (not the browser) so a refresh or a second tab doesn't reset it.
  const daily = planLimits(ctx.business).copilotDailyLimit;
  if (Number.isFinite(daily)) {
    const used = await prisma.analyticsEvent.count({ where: { businessId: ctx.business.id, name: "copilot_question", createdAt: { gte: startOfDay(new Date()) } } });
    if (used >= daily) return `You've used today's ${daily} assistant questions on ${PLANS[effectivePlan(ctx.business)].name}. Pro includes unlimited questions, AI-drafted replies and summaries — upgrade under Settings → Subscription, or ask again tomorrow.`;
  }
  await track("copilot_question", { businessId: ctx.business.id });

  // Every call spends real OpenAI tokens — cap per-business usage so one account can't
  // run up the API bill or be used to hammer the model. Counted in the database, so the
  // cap holds across serverless instances, not just within one process.
  if (!(await dbRateLimit(ctx.business.id, "copilot_question", { limit: ASSISTANT_HOURLY_LIMIT, windowMs: 60 * 60 * 1000 })).ok) {
    return `You've hit the assistant's hourly limit (${ASSISTANT_HOURLY_LIMIT} questions). It resets within the hour — nothing was lost.`;
  }

  const facts = await gatherBusinessFacts(ctx.business.id);
  // With a model configured the answer is written from the facts; without one (or if the
  // model fails) the question is answered from the same records by rules, never by dumping
  // the raw fact sheet on the owner.
  const written = await summarizeCopilotAnswer(question, facts.text, { businessId: ctx.business.id, feature: "assistant" });
  return written ?? answerFromRecords(question, facts.data);
}
