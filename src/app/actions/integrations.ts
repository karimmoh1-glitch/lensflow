"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ingestInboundMessage } from "@/server/leadIngestion";
import { smsEntitled } from "@/lib/billing";
import { track } from "@/lib/analytics";
import type { ChannelType, IntegrationProvider } from "@prisma/client";

/** Returns `{ error }` for the plan-limit case rather than throwing — see toggleAutomation
 * for why (a thrown action error is a 500 whose message production strips). */
export async function toggleIntegration(provider: IntegrationProvider, connect: boolean): Promise<{ error?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  // SMS is a Pro+ feature on the pricing page — enforce it here, not just by hiding the
  // toggle in the UI, so a Free-plan business can't unlock it by calling this action
  // directly. Disconnecting is always allowed regardless of plan.
  if (provider === "SMS" && connect && !smsEntitled(business)) {
    return { error: "SMS is available on the Pro plan and above. Upgrade from Billing to connect it." };
  }

  await prisma.integration.upsert({
    where: { businessId_provider: { businessId: business.id, provider } },
    create: { businessId: business.id, provider, status: connect ? "DEMO" : "NOT_CONNECTED", lastSyncedAt: connect ? new Date() : null },
    update: { status: connect ? "DEMO" : "NOT_CONNECTED", lastSyncedAt: connect ? new Date() : null },
  });
  if (connect) await track("integration_connected", { businessId: business.id, properties: { provider } });
  revalidatePath("/dashboard/settings");
  return {};
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
