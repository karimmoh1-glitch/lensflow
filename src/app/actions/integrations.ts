"use server";

import { prisma } from "@/lib/db";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ingestInboundMessage } from "@/server/leadIngestion";
import type { ChannelType, IntegrationProvider } from "@prisma/client";

/** Returns `{ error }` for the plan-limit case rather than throwing — see toggleAutomation
 * for why (a thrown action error is a 500 whose message production strips). */
export async function toggleIntegration(provider: IntegrationProvider, connect: boolean): Promise<{ error?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  // There is no such thing as a toggled-on integration any more: a connection is only ever
  // made by the provider's own sign-in (Settings → Integrations), which is where the plan's
  // allowance is enforced. This action can only clear a legacy demo row.
  if (connect) {
    return { error: "Connections are made from Settings → Integrations with the provider's own sign-in." };
  }
  await prisma.integration.updateMany({ where: { businessId: business.id, provider, status: "DEMO" }, data: { status: "NOT_CONNECTED", lastSyncedAt: null } });
  revalidatePath("/dashboard/settings");
  return {};
}

/**
 * Injects a simulated inbound message through the exact same ingestion path a real
 * webhook uses (see src/server/leadIngestion.ts) so the omnichannel pipeline can be
 * demoed without a real Instagram/SMS/WhatsApp connection. Clearly a demo tool — never
 * presented as a real customer message.
 */
export async function simulateInboundMessage(params: { channel: ChannelType; senderName: string; handle: string; body: string }, session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) throw new Error("unauthorized");
  // A development aid and the public demo's only. A real workspace on production never
  // gets synthetic messages that could be mistaken for customers.
  if (process.env.NODE_ENV === "production" && ctx.business.handle !== "alex-photo") {
    throw new Error("Test messages are only available in the demo workspace.");
  }

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
