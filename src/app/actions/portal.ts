"use server";

import { assertIds } from "@/lib/ids";

import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";
import { requireClientRecord } from "@/server/portalAuth";
import { notifyBusiness } from "@/server/notify";
import { revalidatePath } from "next/cache";

export async function sendPortalMessage(conversationId: string, body: string, session?: SessionPayload | null) {
  assertIds(conversationId);
  const ctx = await requireClientRecord(session);
  if (!ctx) throw new Error("unauthorized");
  if (typeof body !== "string" || !body.trim() || body.length > 5000) throw new Error("Write a message of up to 5,000 characters.");

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clientId: ctx.client.id, businessId: ctx.business.id },
  });
  if (!conversation) throw new Error("not found");

  await prisma.message.create({ data: { conversationId, direction: "INBOUND", body } });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });

  // This used to "email" the business at a null address, which reached nobody: a customer
  // could write in the portal and the business would never be told. It goes through the
  // same fan-out as every other inbound message now — in-app, phone, and Slack when it is
  // connected — and carries who wrote rather than what they said.
  await notifyBusiness(ctx.business.id, {
    kind: "message",
    title: `${ctx.client.name} wrote from their portal`,
    body: "A new message is waiting in the inbox.",
    target: { kind: "conversation", id: conversationId },
  });

  revalidatePath("/portal");
}
