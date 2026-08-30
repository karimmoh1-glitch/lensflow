"use server";

import { requireRole } from "@/lib/auth";
import { gatherBusinessFacts } from "@/server/copilotFacts";
import { summarizeCopilotAnswer } from "@/lib/ai";

export async function askCopilot(question: string): Promise<string> {
  // Facts include every client's payment/lead status — a client or partner asking the
  // copilot must never be able to see the rest of the org's business.
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");

  const facts = await gatherBusinessFacts(ctx.business.id);
  return summarizeCopilotAnswer(question, facts);
}
