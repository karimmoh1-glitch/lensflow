import { prisma } from "@/lib/db";
import { sendOnChannel } from "@/lib/messaging";
import { getValidAccessToken, sendGmailMessage } from "@/lib/google";
import { sendInstagramMessage } from "@/lib/meta/instagram";
import { sendWhatsAppText, withinServiceWindow } from "@/lib/meta/whatsapp";
import { isTokenInvalid } from "@/lib/meta/common";
import { reportFailure } from "@/lib/observe";
import type { ChannelType, MessageStatus } from "@prisma/client";

/**
 * The one way a message leaves Daythread for a customer. Used by the composer and by the
 * automation runner so both behave the same:
 *
 *   - Email prefers the business's own connected Gmail (real OAuth send, threaded), then the
 *     platform email provider.
 *   - Instagram and WhatsApp send with the business's own connected account. A WhatsApp
 *     free-form message outside the 24-hour customer-service window is refused up front
 *     (Meta would reject it) and recorded as NOT_DELIVERED with the reason.
 *   - SMS sends from the business's own Twilio number.
 *   - A channel that isn't connected for this business — or a token the provider has
 *     revoked — yields NOT_DELIVERED: the message is stored so the thread is honest about
 *     what was attempted, but nothing is ever marked SENT that didn't leave.
 */
export type Delivery = { status: MessageStatus; providerMessageId?: string; error?: string; via: "gmail" | "provider" | "instagram" | "whatsapp" | "sms" | "none" };

export async function deliverToCustomer(params: {
  businessId: string;
  businessName: string;
  businessHandle: string;
  channel: ChannelType;
  to: string | null;
  body: string;
  subject?: string;
  inReplyTo?: string | null;
  /** For WhatsApp's service window: when the customer last wrote. */
  lastInboundAt?: Date | null;
}): Promise<Delivery> {
  const { businessId, businessName, businessHandle, channel, to, body, subject, inReplyTo } = params;
  if (!to) return { status: "NOT_DELIVERED", error: "No address to send to.", via: "none" };

  if (channel === "EMAIL") {
    const gmail = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "EMAIL" } } });
    if (gmail?.status !== "NOT_CONNECTED" && gmail?.refreshToken && gmail.externalAccount) {
      try {
        const accessToken = await getValidAccessToken(gmail);
        const sent = await sendGmailMessage({ accessToken, fromEmail: gmail.externalAccount, fromName: businessName, to, subject: subject ?? "Re: your inquiry", body, inReplyTo: inReplyTo ?? undefined, references: inReplyTo ?? undefined });
        return { status: "SENT", providerMessageId: sent.id, via: "gmail" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Gmail send failed";
        if (/invalid_grant|No refresh token/i.test(msg)) await prisma.integration.update({ where: { id: gmail.id }, data: { status: "NEEDS_ATTENTION", lastError: "Google revoked access — reconnect", lastErrorAt: new Date() } });
        await reportFailure("delivery", "Gmail send failed", { businessId, provider: "EMAIL", error: err });
        return { status: "FAILED", error: "Gmail rejected the send. Reconnect Gmail if this keeps happening.", via: "gmail" };
      }
    }
  }

  if (channel === "INSTAGRAM") {
    const ig = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "INSTAGRAM" } } });
    if (!ig || ig.status === "NOT_CONNECTED" || !ig.accessToken || !ig.externalId) return { status: "NOT_DELIVERED", error: "Instagram isn't connected for this business.", via: "none" };
    if (ig.status === "NEEDS_ATTENTION") return { status: "NOT_DELIVERED", error: "Instagram needs to be reconnected.", via: "none" };
    try {
      const sent = await sendInstagramMessage(ig.accessToken, ig.externalId, to, body);
      return { status: "SENT", providerMessageId: sent.messageId, via: "instagram" };
    } catch (err) {
      if (isTokenInvalid(err)) await prisma.integration.update({ where: { id: ig.id }, data: { status: "NEEDS_ATTENTION", lastError: "Instagram revoked access — reconnect", lastErrorAt: new Date() } });
      await reportFailure("delivery", "Instagram send failed", { businessId, provider: "INSTAGRAM", error: err });
      return { status: "FAILED", error: err instanceof Error ? scrubMeta(err.message) : "Instagram rejected the message.", via: "instagram" };
    }
  }

  if (channel === "WHATSAPP") {
    const wa = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "WHATSAPP" } } });
    if (!wa || wa.status === "NOT_CONNECTED" || !wa.accessToken || !wa.externalId) return { status: "NOT_DELIVERED", error: "WhatsApp isn't connected for this business.", via: "none" };
    if (wa.status === "NEEDS_ATTENTION") return { status: "NOT_DELIVERED", error: "WhatsApp needs to be reconnected.", via: "none" };
    if (!withinServiceWindow(params.lastInboundAt ?? null)) return { status: "NOT_DELIVERED", error: "Outside WhatsApp's 24-hour reply window — a free-form message would be rejected. Wait for their next message or use an approved template.", via: "none" };
    try {
      const sent = await sendWhatsAppText(wa.accessToken, wa.externalId, to, body);
      return { status: "SENT", providerMessageId: sent.messageId, via: "whatsapp" };
    } catch (err) {
      if (isTokenInvalid(err)) await prisma.integration.update({ where: { id: wa.id }, data: { status: "NEEDS_ATTENTION", lastError: "WhatsApp revoked access — reconnect", lastErrorAt: new Date() } });
      await reportFailure("delivery", "WhatsApp send failed", { businessId, provider: "WHATSAPP", error: err });
      return { status: "FAILED", error: err instanceof Error ? scrubMeta(err.message) : "WhatsApp rejected the message.", via: "whatsapp" };
    }
  }

  let from: string | null | undefined;
  if (channel === "SMS") {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { twilioPhoneNumber: true } });
    from = business?.twilioPhoneNumber;
    if (!from && !process.env.TWILIO_FROM_NUMBER) return { status: "NOT_DELIVERED", error: "This business doesn't have a text number yet. Get one in Settings → Integrations.", via: "none" };
  }

  const inboundDomain = process.env.RESEND_INBOUND_DOMAIN;
  const replyTo = channel === "EMAIL" && inboundDomain ? `${businessHandle}@${inboundDomain}` : undefined;
  const headers = channel === "EMAIL" && inReplyTo ? { "In-Reply-To": inReplyTo, References: inReplyTo } : undefined;
  const result = await sendOnChannel({ channel, to, body, subject, fromName: businessName, replyTo, headers, from });
  if (!result.ok) {
    await reportFailure("delivery", `${channel} send failed`, { businessId, provider: channel, error: result.error });
    return { status: "FAILED", error: result.error, via: "provider" };
  }
  if (result.simulated) return { status: "NOT_DELIVERED", error: `${channelLabel(channel)} isn't connected on this deployment.`, via: "none" };
  return { status: "SENT", providerMessageId: result.providerMessageId, via: channel === "SMS" ? "sms" : "provider" };
}

function scrubMeta(message: string): string {
  return message.replace(/EAA[A-Za-z0-9]+/g, "[token]").slice(0, 200);
}

export function channelLabel(channel: ChannelType): string {
  return { EMAIL: "Email", SMS: "SMS", WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", WEBSITE: "Website", PHONE: "Phone" }[channel];
}
