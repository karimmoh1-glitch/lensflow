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

  const result = await sendOnChannel({ channel: conversation.channel, to: conversation.externalHandle, body });

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        body,
        aiDrafted,
        status: result.ok ? "SENT" : "FAILED",
        sentByUserId: ctxSession.userId,
      },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
    prisma.lead.updateMany({ where: { conversationId }, data: { respondedAt: new Date(), status: "CONTACTED" } }),
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
