"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { SessionPayload } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { draftReply } from "@/lib/ai";
import { aiEntitled, smsEntitled } from "@/lib/billing";
import { deliverToCustomer } from "@/server/deliver";
import type { SendResult } from "@/lib/channels/types";

/** "AI-powered lead scoring & reply drafts" is the marketed Pro+ feature — scoped here to
 * the reply-draft generator specifically, not the underlying lead extraction/scoring that
 * runs for every inbound message regardless of plan. Free's own feature list promises a
 * working "unified email + website inbox," so gating basic lead intake would break a
 * capability Free is supposed to have; gating the AI-drafted-reply button doesn't. */
export async function generateDraftAction(
  conversationId: string,
  session?: SessionPayload | null
): Promise<{ text?: string; error?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  // Returned, not thrown: a thrown server-action error is a 500 whose message production
  // replaces with a generic one, so the upgrade prompt would never reach the user.
  if (!aiEntitled(business)) {
    return { error: "AI-drafted replies are available on the Pro plan and above. Upgrade from Billing to use this." };
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, client: true },
  });
  if (!conversation) throw new Error("not found");

  const lastInbound = conversation.messages[0];
  const services = await prisma.service.findMany({ where: { businessId: business.id, active: true }, orderBy: { sortOrder: "asc" } });

  const text = await draftReply({
    businessName: business.name,
    services: services.map((s) => ({ name: s.name, priceCents: s.priceCents, durationMins: s.durationMins })),
    customerMessage: lastInbound?.body ?? "",
    customerName: conversation.client?.name,
    depositPercent: business.depositPercent,
  });
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
    return { ok: false, error: "SMS replies are available on the Pro plan and above. Upgrade from Billing to reply here." } as SendResult;
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
 * destroying the conversation. Messages, the associated lead, and any booking/payment
 * history all stay intact (bookings/payments are queried from their own tables, not
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
