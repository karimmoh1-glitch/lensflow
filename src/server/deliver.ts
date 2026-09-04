import { prisma } from "@/lib/db";
import { sendOnChannel } from "@/lib/messaging";
import { getValidAccessToken, sendGmailMessage } from "@/lib/google";
import type { ChannelType, MessageStatus } from "@prisma/client";

/**
 * The one way a message leaves Daythread for a customer. Used by the composer and by the
 * automation runner so both behave the same:
 *
 *   - Email prefers the business's own connected Gmail (real OAuth send, threaded), then
 *     the platform email provider.
 *   - Any channel whose provider isn't configured on this deployment is reported as
 *     NOT_DELIVERED — the message is stored so the thread is honest about what was
 *     attempted, but nothing is ever marked SENT that didn't leave the building.
 */
export type Delivery = { status: MessageStatus; providerMessageId?: string; error?: string; via: "gmail" | "provider" | "none" };

export async function deliverToCustomer(params: {
  businessId: string;
  businessName: string;
  businessHandle: string;
  channel: ChannelType;
  to: string | null;
  body: string;
  subject?: string;
  /** For email threading: the provider id of the last inbound message. */
  inReplyTo?: string | null;
}): Promise<Delivery> {
  const { businessId, businessName, businessHandle, channel, to, body, subject, inReplyTo } = params;
  if (!to) return { status: "NOT_DELIVERED", error: "No address to send to.", via: "none" };

  if (channel === "EMAIL") {
    const gmail = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "EMAIL" } } });
    if (gmail?.refreshToken && gmail.externalAccount) {
      try {
        const accessToken = await getValidAccessToken(gmail);
        const sent = await sendGmailMessage({ accessToken, fromEmail: gmail.externalAccount, fromName: businessName, to, subject: subject ?? "Re: your inquiry", body, inReplyTo: inReplyTo ?? undefined, references: inReplyTo ?? undefined });
        return { status: "SENT", providerMessageId: sent.id, via: "gmail" };
      } catch (err) {
        console.error("[deliver] gmail send failed", err);
        return { status: "FAILED", error: err instanceof Error ? err.message : "Gmail send failed", via: "gmail" };
      }
    }
  }

  const inboundDomain = process.env.RESEND_INBOUND_DOMAIN;
  const replyTo = channel === "EMAIL" && inboundDomain ? `${businessHandle}@${inboundDomain}` : undefined;
  const headers = channel === "EMAIL" && inReplyTo ? { "In-Reply-To": inReplyTo, References: inReplyTo } : undefined;
  const result = await sendOnChannel({ channel, to, body, subject, fromName: businessName, replyTo, headers });
  if (!result.ok) return { status: "FAILED", error: result.error, via: "provider" };
  if (result.simulated) return { status: "NOT_DELIVERED", error: `${channelLabel(channel)} isn't connected on this deployment.`, via: "none" };
  return { status: "SENT", providerMessageId: result.providerMessageId, via: "provider" };
}

export function channelLabel(channel: ChannelType): string {
  return { EMAIL: "Email", SMS: "SMS", WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", WEBSITE: "Website", PHONE: "Phone" }[channel];
}
