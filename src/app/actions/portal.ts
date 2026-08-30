"use server";

import { prisma } from "@/lib/db";
import { requireBusiness } from "@/lib/auth";
import { createCardCheckout } from "@/lib/payments";
import { sendOnChannel } from "@/lib/messaging";
import { revalidatePath } from "next/cache";

/** Resolves the Client CRM record for the signed-in CLIENT user, scoped to their active
 * organization. Every portal query must go through this — a client's userId only ever
 * maps to one Client row per org, so there's no id to spoof from the client side. */
export async function requireClientRecord() {
  const ctx = await requireBusiness();
  if (!ctx || ctx.role !== "CLIENT") return null;
  const client = await prisma.client.findFirst({ where: { userId: ctx.session.userId, businessId: ctx.business.id } });
  if (!client) return null;
  return { ...ctx, client };
}

export async function payOutstanding(paymentId: string): Promise<{ checkoutUrl?: string; error?: string }> {
  const ctx = await requireClientRecord();
  if (!ctx) return { error: "unauthorized" };

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, clientId: ctx.client.id, businessId: ctx.business.id, status: "AWAITING_CONFIRMATION", method: "CARD" },
    include: { booking: { include: { service: true } } },
  });
  if (!payment) return { error: "Payment not found." };

  const result = await createCardCheckout({
    amountCents: payment.amountCents,
    description: `${payment.purpose === "DEPOSIT" ? "Deposit" : "Balance"} — ${payment.booking?.service.name ?? "Session"}`,
    successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/portal?paid=1`,
    cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/portal`,
    metadata: { paymentId: payment.id, businessId: ctx.business.id },
  });

  return { checkoutUrl: result.url };
}

export async function sendPortalMessage(conversationId: string, body: string) {
  const ctx = await requireClientRecord();
  if (!ctx) throw new Error("unauthorized");

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clientId: ctx.client.id, businessId: ctx.business.id },
  });
  if (!conversation) throw new Error("not found");

  await prisma.message.create({ data: { conversationId, direction: "INBOUND", body } });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
  await sendOnChannel({ channel: "EMAIL", to: null, body: `New portal message from ${ctx.client.name}: ${body}` });

  revalidatePath("/portal");
}
