"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { SessionPayload } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { draftReply } from "@/lib/ai";
import { sendOnChannel } from "@/lib/messaging";
import { getValidAccessToken, sendGmailMessage } from "@/lib/google";
import type { SendResult } from "@/lib/channels/types";

export async function generateDraftAction(conversationId: string, session?: SessionPayload | null): Promise<string> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, client: true },
  });
  if (!conversation) throw new Error("not found");

  const lastInbound = conversation.messages[0];
  const services = await prisma.service.findMany({ where: { businessId: business.id, active: true }, orderBy: { sortOrder: "asc" } });

  return draftReply({
    businessName: business.name,
    services: services.map((s) => ({ name: s.name, priceCents: s.priceCents, durationMins: s.durationMins })),
    customerMessage: lastInbound?.body ?? "",
    customerName: conversation.client?.name,
    depositPercent: business.depositPercent,
  });
}

export async function sendReplyAction(conversationId: string, body: string, aiDrafted: boolean, session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  const { business, session: ctxSession } = ctx;

  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, businessId: business.id } });
  if (!conversation) throw new Error("not found");

  // For email specifically: Reply-To routes the customer's reply back through our own
  // webhook instead of nowhere, and threading headers keep it in the same thread in
  // their mail client, not just in ours.
  let replyTo: string | undefined;
  let headers: Record<string, string> | undefined;
  let lastInboundMessageId: string | undefined;
  if (conversation.channel === "EMAIL") {
    const inboundDomain = process.env.RESEND_INBOUND_DOMAIN;
    if (inboundDomain) replyTo = `${business.handle}@${inboundDomain}`;

    const lastInbound = await prisma.message.findFirst({
      where: { conversationId, direction: "INBOUND", providerMessageId: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    lastInboundMessageId = lastInbound?.providerMessageId ?? undefined;
    if (lastInboundMessageId) {
      headers = { "In-Reply-To": lastInboundMessageId, References: lastInboundMessageId };
    }
  }

  // A connected Gmail account (per-business, real OAuth) takes priority over the
  // platform-wide Resend path for customer replies specifically — transactional system
  // email (invitations, password resets) never goes through a business's personal
  // Gmail, only their own customer conversations do.
  let result: SendResult;
  const gmailIntegration =
    conversation.channel === "EMAIL" && conversation.externalHandle
      ? await prisma.integration.findUnique({ where: { businessId_provider: { businessId: business.id, provider: "EMAIL" } } })
      : null;

  if (gmailIntegration?.refreshToken && conversation.externalHandle) {
    try {
      const accessToken = await getValidAccessToken(gmailIntegration);
      const sent = await sendGmailMessage({
        accessToken,
        fromEmail: gmailIntegration.externalAccount!,
        fromName: business.name,
        to: conversation.externalHandle,
        subject: "Re: your inquiry",
        body,
        inReplyTo: lastInboundMessageId,
        references: lastInboundMessageId,
      });
      result = { ok: true, simulated: false, providerMessageId: sent.id };
    } catch (err) {
      console.error("[inbox] gmail send failed", err);
      result = { ok: false, error: err instanceof Error ? err.message : "Gmail send failed" };
    }
  } else {
    result = await sendOnChannel({
      channel: conversation.channel,
      to: conversation.externalHandle,
      body,
      fromName: business.name,
      replyTo,
      headers,
    });
  }

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
        status: result.ok ? "SENT" : "FAILED",
        sentByUserId: ctxSession.userId,
        providerMessageId: result.ok ? result.providerMessageId : undefined,
      },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
    ...(result.ok ? [prisma.lead.updateMany({ where: { conversationId }, data: { respondedAt: new Date(), status: "CONTACTED" as const } })] : []),
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
