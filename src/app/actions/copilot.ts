"use server";

import { requireRole } from "@/lib/auth";
import { aiEntitled } from "@/lib/billing";
import { gatherBusinessFacts } from "@/server/copilotFacts";
import { summarizeCopilotAnswer } from "@/lib/ai";
import { rateLimit } from "@/lib/rateLimit";

export async function askCopilot(question: string): Promise<string> {
  // Facts include every client's payment/lead status — a client or partner asking the
  // copilot must never be able to see the rest of the org's business.
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");
  if (!aiEntitled(ctx.business)) return "Copilot is part of the Pro plan and above. Upgrade from Billing to ask it about your business.";

  // Every call spends real OpenAI tokens — cap per-business usage so one account can't
  // run up the API bill or be used to hammer the model.
  if (!rateLimit(`copilot:${ctx.business.id}`, { limit: 40, windowMs: 60 * 60 * 1000 }).ok) {
    throw new Error("You've hit the copilot's hourly limit. Try again in a bit.");
  }

  const facts = await gatherBusinessFacts(ctx.business.id);
  return summarizeCopilotAnswer(question, facts);
}
