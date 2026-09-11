"use server";

import { prisma } from "@/lib/db";
import { requireBusiness, type SessionPayload } from "@/lib/auth";
import { notifyBusiness } from "@/server/notify";
import { revalidatePath } from "next/cache";

/** Resolves the Client CRM record for the signed-in CLIENT user, scoped to their active
 * organization. Every portal query must go through this — a client's userId only ever
 * maps to one Client row per org, so there's no id to spoof from the client side.
 * Accepts an optional session override (same pattern as requireRole/confirmPayment) so
 * callers — and their tests — can pass a specific session instead of always reading the
 * request's cookie. */
export async function requireClientRecord(session?: SessionPayload | null) {
  const ctx = await requireBusiness(session);
  if (!ctx || ctx.role !== "CLIENT") return null;
  const client = await prisma.client.findFirst({ where: { userId: ctx.session.userId, businessId: ctx.business.id } });
  if (!client) return null;
  return { ...ctx, client };
}


export async function sendPortalMessage(conversationId: string, body: string, session?: SessionPayload | null) {
  const ctx = await requireClientRecord(session);
  if (!ctx) throw new Error("unauthorized");

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
