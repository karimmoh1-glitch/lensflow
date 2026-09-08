"use server";

import { prisma } from "@/lib/db";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { aiEntitled } from "@/lib/billing";
import { splitMessage } from "@/lib/cleanMessage";
import { extractLeadInfoByRules, summarizeMessageText } from "@/lib/ai";
import { summarizeMessageByRules } from "@/lib/opportunity";
import { checkAiLimit } from "@/server/aiUsage";
import { isSpendLimit } from "@/lib/aiPolicy";

const STAFF = ["OWNER", "ADMIN", "PHOTOGRAPHER"] as const;

export type MessageSummaryResult = { summary?: string; source?: "ai" | "rules"; cached?: boolean; error?: string };

/**
 * "Summarize" on one message. Cached on the row, so a second click costs nothing; written
 * by the model when the plan has AI and the workspace is under its limits, and by the rules
 * otherwise — labelled either way, so nobody mistakes a template for the model's reading.
 * Tenant-scoped through the conversation: a message id from another workspace is not found.
 */
export async function summarizeMessage(messageId: string, session?: SessionPayload | null): Promise<MessageSummaryResult> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversation: { businessId: business.id } },
    select: { id: true, body: true, direction: true, summary: true, summaryAt: true, summarySource: true, conversation: { select: { id: true, client: { select: { name: true } }, lead: { select: { extractedName: true } } } } },
  });
  if (!message) return { error: "That message isn't here anymore." };
  if (message.summary && message.summaryAt) {
    return { summary: message.summary, source: message.summarySource === "ai" ? "ai" : "rules", cached: true };
  }

  await track("message_summary_requested", { businessId: business.id, properties: { direction: message.direction } });

  const clean = splitMessage(message.body).text;
  const personName = message.direction === "INBOUND" ? (message.conversation.client?.name ?? message.conversation.lead?.extractedName ?? null) : null;
  let summary: string | null = null;
  let source: "ai" | "rules" = "rules";

  if (aiEntitled(business)) {
    const gate = await checkAiLimit(business.id, "message_summary");
    if (!gate.ok && isSpendLimit(gate.reason)) {
      await track("message_summary_failed", { businessId: business.id, properties: { reason: gate.reason } });
      return { error: gate.message };
    }
    // A missing key or a deliberate switch-off falls through to the rules, as everywhere else.
    summary = await summarizeMessageText(clean, personName, { businessId: business.id, feature: "message_summary" });
    if (summary) source = "ai";
  }
  if (!summary) {
    summary = summarizeMessageByRules(clean, extractLeadInfoByRules(clean));
  }

  await prisma.message.update({ where: { id: message.id }, data: { summary, summaryAt: new Date(), summarySource: source } });
  await track("message_summary_completed", { businessId: business.id, properties: { source, direction: message.direction } });
  return { summary, source, cached: false };
}
