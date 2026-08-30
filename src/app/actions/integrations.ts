"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ingestInboundMessage } from "@/server/leadIngestion";
import type { ChannelType, IntegrationProvider } from "@prisma/client";

export async function toggleIntegration(provider: IntegrationProvider, connect: boolean) {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  await prisma.integration.upsert({
    where: { businessId_provider: { businessId: business.id, provider } },
    create: { businessId: business.id, provider, status: connect ? "DEMO" : "NOT_CONNECTED", lastSyncedAt: connect ? new Date() : null },
    update: { status: connect ? "DEMO" : "NOT_CONNECTED", lastSyncedAt: connect ? new Date() : null },
  });
  revalidatePath("/dashboard/settings");
}

/**
 * Injects a simulated inbound message through the exact same ingestion path a real
 * webhook uses (see src/server/leadIngestion.ts) so the omnichannel pipeline can be
 * demoed without a real Instagram/SMS/WhatsApp connection. Clearly a demo tool — never
 * presented as a real customer message.
 */
export async function simulateInboundMessage(params: { channel: ChannelType; senderName: string; handle: string; body: string }) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");

  const { conversation } = await ingestInboundMessage({
    businessId: ctx.business.id,
    channel: params.channel,
    senderName: params.senderName,
    senderHandle: params.handle,
    body: params.body,
    clientEmail: params.channel === "EMAIL" ? params.handle : undefined,
  });

  redirect(`/dashboard/inbox?c=${conversation.id}`);
}
