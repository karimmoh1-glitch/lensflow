"use server";

import { requireRole } from "@/lib/auth";
import { planLimits, PLANS, effectivePlan } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import { startOfDay } from "date-fns";
import { gatherBusinessFacts } from "@/server/copilotFacts";
import { summarizeCopilotAnswer } from "@/lib/ai";
import { rateLimit } from "@/lib/rateLimit";

export async function askCopilot(question: string): Promise<string> {
  // Facts include every client's payment/lead status — a client or partner asking the
  // copilot must never be able to see the rest of the org's business.
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");
  // Free gets a limited copilot: a handful of questions a day, counted in the database
  // (not the browser) so a refresh or a second tab doesn't reset it.
  const daily = planLimits(ctx.business).copilotDailyLimit;
  if (Number.isFinite(daily)) {
    const used = await prisma.analyticsEvent.count({ where: { businessId: ctx.business.id, name: "copilot_question", createdAt: { gte: startOfDay(new Date()) } } });
    if (used >= daily) return `You've used today's ${daily} Copilot questions on ${PLANS[effectivePlan(ctx.business)].name}. Pro includes unlimited Copilot, AI-drafted replies and summaries — upgrade from Billing, or ask again tomorrow.`;
  }
  await track("copilot_question", { businessId: ctx.business.id });

  // Every call spends real OpenAI tokens — cap per-business usage so one account can't
  // run up the API bill or be used to hammer the model.
  if (!rateLimit(`copilot:${ctx.business.id}`, { limit: 40, windowMs: 60 * 60 * 1000 }).ok) {
    throw new Error("You've hit the copilot's hourly limit. Try again in a bit.");
  }

  const facts = await gatherBusinessFacts(ctx.business.id);
  return summarizeCopilotAnswer(question, facts);
}
