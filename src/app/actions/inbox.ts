"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { SessionPayload } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { draftReply } from "@/lib/ai";
import { sendOnChannel } from "@/lib/messaging";

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
  if (conversation.channel === "EMAIL") {
    const inboundDomain = process.env.RESEND_INBOUND_DOMAIN;
    if (inboundDomain) replyTo = `${business.handle}@${inboundDomain}`;

    const lastInbound = await prisma.message.findFirst({
      where: { conversationId, direction: "INBOUND", providerMessageId: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    if (lastInbound?.providerMessageId) {
      headers = { "In-Reply-To": lastInbound.providerMessageId, References: lastInbound.providerMessageId };
    }
  }

  const result = await sendOnChannel({
    channel: conversation.channel,
    to: conversation.externalHandle,
    body,
    fromName: business.name,
    replyTo,
    headers,
  });

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
