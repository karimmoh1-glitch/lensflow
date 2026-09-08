"use server";

import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import { requireRole } from "@/lib/auth";
import type { SessionPayload } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { draftReply } from "@/lib/ai";
import { aiEntitled, smsEntitled } from "@/lib/billing";
import { checkAiLimit } from "@/server/aiUsage";
import { isSpendLimit } from "@/lib/aiPolicy";
import { isDraftMode, type DraftMode } from "@/lib/draftModes";
import { readBusinessMemory, memoryPromptLines } from "@/lib/businessMemory";
import { shouldScheduleQuoteFollowUp, quoteFollowUpAt } from "@/lib/quoteFollowUp";
import { deliverToCustomer } from "@/server/deliver";
import type { SendResult } from "@/lib/channels/types";

/** "AI-powered lead scoring & reply drafts" is the marketed Pro+ feature — scoped here to
 * the reply-draft generator specifically, not the underlying lead extraction/scoring that
 * runs for every inbound message regardless of plan. Free's own feature list promises a
 * working "unified email + website inbox," so gating basic lead intake would break a
 * capability Free is supposed to have; gating the AI-drafted-reply button doesn't. */
export async function generateDraftAction(
  conversationId: string,
  session?: SessionPayload | null,
  modeInput?: unknown
): Promise<{ text?: string; error?: string }> {
  const mode: DraftMode = isDraftMode(modeInput) ? modeInput : "reply";
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  // Returned, not thrown: a thrown server-action error is a 500 whose message production
  // replaces with a generic one, so the upgrade prompt would never reach the user.
  if (!aiEntitled(business)) {
    return { error: "AI-drafted replies are part of Daythread Pro. Upgrade under Settings → Subscription." };
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, client: true },
  });
  if (!conversation) throw new Error("not found");

  // Entitlement says this workspace may draft; the limit says whether it may right now.
  // Checked here as well as inside the model call, so a throttled person gets a real
  // answer instead of a template that looks like the model wrote it. A missing key or a
  // deliberate switch-off falls through to that template on purpose, unchanged.
  const gate = await checkAiLimit(business.id, "draft");
  if (!gate.ok && isSpendLimit(gate.reason)) return { error: gate.message };

  const lastInbound = conversation.messages[0];
  const services = await prisma.service.findMany({ where: { businessId: business.id, active: true }, orderBy: { sortOrder: "asc" } });

  const memory = readBusinessMemory(business.memory);
  const text = await draftReply({
    businessName: business.name,
    services: services.map((s) => ({ name: s.name, priceCents: s.priceCents, durationMins: s.durationMins })),
    customerMessage: lastInbound?.body ?? "",
    customerName: conversation.client?.name,
    mode,
    memoryLines: memoryPromptLines(memory),
    tone: memory.tone,
  }, { businessId: business.id, feature: "draft" });
  await track("draft_requested", { businessId: business.id, properties: { mode } });
  if ((await prisma.analyticsEvent.count({ where: { businessId: business.id, name: "first_ai_action" } })) === 0) await track("first_ai_action", { businessId: business.id, properties: { via: "draft" } });
  return { text };
}

export async function sendReplyAction(conversationId: string, body: string, aiDrafted: boolean, session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  const { business, session: ctxSession } = ctx;

  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, businessId: business.id } });
  if (!conversation) throw new Error("not found");

  // Threading for email: the last inbound provider id keeps the reply in the same thread
  // in the customer's mail client, not just in ours.
  let lastInboundMessageId: string | undefined;
  if (conversation.channel === "EMAIL") {
    const lastInbound = await prisma.message.findFirst({
      where: { conversationId, direction: "INBOUND", providerMessageId: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    lastInboundMessageId = lastInbound?.providerMessageId ?? undefined;
  }

  // A downgraded business keeps reading SMS but can't send on it.
  if (conversation.channel === "SMS" && !smsEntitled(business)) {
    return { ok: false, error: "SMS replies and a text number are part of Daythread Pro. Upgrade under Settings → Subscription." } as SendResult;
  }

  const delivery = await deliverToCustomer({
    businessId: business.id,
    businessName: business.name,
    businessHandle: business.handle,
    channel: conversation.channel,
    to: conversation.externalHandle,
    body,
    subject: conversation.subject ? `Re: ${conversation.subject.replace(/^re:\s*/i, "")}` : undefined,
    inReplyTo: lastInboundMessageId,
  });
  const result: SendResult = delivery.status === "SENT" ? { ok: true, simulated: false, providerMessageId: delivery.providerMessageId } : delivery.status === "NOT_DELIVERED" ? { ok: true, simulated: true } : { ok: false, error: delivery.error ?? "Send failed" };

  // Only ever marked SENT once the provider actually confirms it — a failed send keeps
  // the draft text intact (the caller still has it) and the message row records exactly
  // what went wrong instead of silently pretending it went out.
  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        body,
        aiDrafted,
        status: delivery.status,
        sentByUserId: ctxSession.userId,
        providerMessageId: delivery.providerMessageId,
      },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
    // The lead counts as answered only when something actually reached them.
    ...(delivery.status === "SENT" ? [prisma.lead.updateMany({ where: { conversationId }, data: { respondedAt: new Date(), status: "CONTACTED" as const } })] : []),
  ]);

  // A quote that went out gets a follow-up three days later, unless one is already planned.
  if (delivery.status === "SENT") {
    const lead = await prisma.lead.findFirst({ where: { conversationId, businessId: business.id }, select: { id: true, status: true, followUpAt: true } });
    if (shouldScheduleQuoteFollowUp({ body, lead })) {
      const at = quoteFollowUpAt();
      await prisma.lead.update({ where: { id: lead!.id }, data: { followUpAt: at } });
      await track("followup_auto_scheduled", { businessId: business.id, properties: { reason: "quote_sent", daysAhead: 3 } });
    }
  }

  // Activation signal: the first reply that actually reached a customer. Channel only.
  if (delivery.status === "SENT" && (await prisma.message.count({ where: { direction: "OUTBOUND", status: "SENT", conversation: { businessId: business.id } } })) === 1) {
    await track("first_reply_sent", { businessId: business.id, properties: { channel: conversation.channel } });
  }
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard");
  return result;
}

export async function markLeadLost(leadId: string) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");
  await prisma.lead.updateMany({ where: { id: leadId, businessId: ctx.business.id }, data: { status: "LOST" } });
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard");
}

/**
 * "Delete" from the inbox — sets the existing archived flag rather than actually
 * destroying the conversation. Messages, the associated lead, and any booking
 * history all stay intact (bookings are queried from their own tables, not
 * through the conversation, so nothing else breaks); it just stops showing up in the
 * default Inbox view. A real hard-delete of customer correspondence is the kind of
 * irreversible action that shouldn't be one click away.
 */
export async function deleteConversation(conversationId: string) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");
  const result = await prisma.conversation.updateMany({
    where: { id: conversationId, businessId: ctx.business.id },
    data: { archived: true },
  });
  if (result.count === 0) throw new Error("not found");
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard");
}
