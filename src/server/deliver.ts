import { prisma } from "@/lib/db";
import { sendOnChannel } from "@/lib/messaging";
import { getValidAccessToken, sendGmailMessage } from "@/lib/google";
import { sendInstagramMessage } from "@/lib/meta/instagram";
import { sendWhatsAppText, withinServiceWindow, WA_WINDOW_CLOSED_MESSAGE, templatesEnabled } from "@/lib/meta/whatsapp";
import { isTokenInvalid, isPermissionError, isOutsideServiceWindow, userFacingMetaError, scrubMetaMessage } from "@/lib/meta/common";
import { reportFailure } from "@/lib/observe";
import type { ChannelType, MessageStatus } from "@prisma/client";

/**
 * The one way a message leaves Daythread for a customer. Used by the composer, the
 * automation runner and the Business Agent so all three behave the same:
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
 *
 * Nothing here is optimistic. `SENT` means the provider accepted the message and returned
 * its own id; anything else carries a reason a person can act on, and `statusDetail` keeps
 * the machine-readable version on the message row.
 */
export type Delivery = {
  status: MessageStatus;
  providerMessageId?: string;
  /** A sentence for the person who pressed send. Never a token or a raw provider payload. */
  error?: string;
  /** Short machine-readable reason stored on the message row ("window_closed", "not_connected"…). */
  statusDetail?: string;
  via: "gmail" | "provider" | "instagram" | "whatsapp" | "sms" | "none";
};

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
  if (!to) return { status: "NOT_DELIVERED", error: "No address to send to.", statusDetail: "no_recipient", via: "none" };
  if (!body.trim()) return { status: "NOT_DELIVERED", error: "Nothing to send.", statusDetail: "empty", via: "none" };

  if (channel === "EMAIL") {
    const gmail = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "EMAIL" } } });
    if (gmail?.status !== "NOT_CONNECTED" && gmail?.refreshToken && gmail.externalAccount) {
      try {
        const accessToken = await getValidAccessToken(gmail);
        const sent = await sendGmailMessage({ accessToken, fromEmail: gmail.externalAccount, fromName: businessName, to, subject: subject ?? "Re: your inquiry", body, inReplyTo: inReplyTo ?? undefined, references: inReplyTo ?? undefined });
        return { status: "SENT", providerMessageId: sent.id, statusDetail: "accepted", via: "gmail" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Gmail send failed";
        if (/invalid_grant|No refresh token/i.test(msg)) await prisma.integration.update({ where: { id: gmail.id }, data: { status: "NEEDS_ATTENTION", lastError: "Google revoked access — reconnect", lastErrorAt: new Date() } });
        await reportFailure("delivery", "Gmail send failed", { businessId, provider: "EMAIL", error: err });
        return { status: "FAILED", error: "Gmail rejected the send. Reconnect Gmail if this keeps happening.", statusDetail: "provider_rejected", via: "gmail" };
      }
    }
  }

  if (channel === "INSTAGRAM") {
    const ig = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "INSTAGRAM" } } });
    if (!ig || ig.status === "NOT_CONNECTED" || !ig.externalId) return { status: "NOT_DELIVERED", error: "Instagram isn't connected for this business.", statusDetail: "not_connected", via: "none" };
    if (ig.status === "NEEDS_ATTENTION") return { status: "NOT_DELIVERED", error: "Instagram needs to be reconnected before replies can be sent.", statusDetail: "reauth_required", via: "none" };
    // A stored token that will not decrypt reads as null: that is a reconnect, never a send.
    if (!ig.accessToken) {
      await prisma.integration.update({ where: { id: ig.id }, data: { status: "NEEDS_ATTENTION", lastError: "Instagram credentials could not be read — reconnect", lastErrorAt: new Date() } });
      return { status: "NOT_DELIVERED", error: "Instagram needs to be reconnected before replies can be sent.", statusDetail: "reauth_required", via: "none" };
    }
    try {
      const sent = await sendInstagramMessage(ig.accessToken, ig.externalId, to, body);
      return { status: "SENT", providerMessageId: sent.messageId, statusDetail: "accepted", via: "instagram" };
    } catch (err) {
      if (isTokenInvalid(err) || isPermissionError(err)) {
        await prisma.integration.update({ where: { id: ig.id }, data: { status: "NEEDS_ATTENTION", lastError: isPermissionError(err) ? "Instagram permission missing — reconnect and approve messaging" : "Instagram revoked access — reconnect", lastErrorAt: new Date() } });
      }
      await reportFailure("delivery", "Instagram send failed", { businessId, provider: "INSTAGRAM", error: err });
      return { status: "FAILED", error: userFacingMetaError(err, "Instagram rejected the message."), statusDetail: "provider_rejected", via: "instagram" };
    }
  }

  if (channel === "WHATSAPP") {
    const wa = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "WHATSAPP" } } });
    if (!wa || wa.status === "NOT_CONNECTED" || !wa.externalId) return { status: "NOT_DELIVERED", error: "WhatsApp isn't connected for this business.", statusDetail: "not_connected", via: "none" };
    if (wa.status === "NEEDS_ATTENTION") return { status: "NOT_DELIVERED", error: "WhatsApp needs to be reconnected before replies can be sent.", statusDetail: "reauth_required", via: "none" };
    if (!wa.accessToken) {
      await prisma.integration.update({ where: { id: wa.id }, data: { status: "NEEDS_ATTENTION", lastError: "WhatsApp credentials could not be read — reconnect", lastErrorAt: new Date() } });
      return { status: "NOT_DELIVERED", error: "WhatsApp needs to be reconnected before replies can be sent.", statusDetail: "reauth_required", via: "none" };
    }
    // Enforced here, on the server, before anything leaves: Meta rejects a free-form
    // message outside the window, and templates are not implemented yet.
    if (!withinServiceWindow(params.lastInboundAt ?? null)) {
      return { status: "NOT_DELIVERED", error: templatesEnabled() ? "Outside WhatsApp's 24-hour reply window — send an approved template instead." : WA_WINDOW_CLOSED_MESSAGE, statusDetail: "window_closed", via: "none" };
    }
    try {
      const sent = await sendWhatsAppText(wa.accessToken, wa.externalId, to, body);
      return { status: "SENT", providerMessageId: sent.messageId, statusDetail: "accepted", via: "whatsapp" };
    } catch (err) {
      if (isTokenInvalid(err) || isPermissionError(err)) {
        await prisma.integration.update({ where: { id: wa.id }, data: { status: "NEEDS_ATTENTION", lastError: isPermissionError(err) ? "WhatsApp permission missing — reconnect and approve messaging" : "WhatsApp revoked access — reconnect", lastErrorAt: new Date() } });
      }
      await reportFailure("delivery", "WhatsApp send failed", { businessId, provider: "WHATSAPP", error: err });
      // Meta can still refuse for the window even when our own clock said it was open.
      if (isOutsideServiceWindow(err)) return { status: "NOT_DELIVERED", error: WA_WINDOW_CLOSED_MESSAGE, statusDetail: "window_closed", via: "none" };
      return { status: "FAILED", error: userFacingMetaError(err, "WhatsApp rejected the message."), statusDetail: "provider_rejected", via: "whatsapp" };
    }
  }

  let from: string | null | undefined;
  if (channel === "SMS") {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { twilioPhoneNumber: true } });
    from = business?.twilioPhoneNumber;
    if (!from && !process.env.TWILIO_FROM_NUMBER) return { status: "NOT_DELIVERED", error: "This business doesn't have a text number yet. Get one in Settings → Channels.", statusDetail: "not_connected", via: "none" };
  }

  const inboundDomain = process.env.RESEND_INBOUND_DOMAIN;
  const replyTo = channel === "EMAIL" && inboundDomain ? `${businessHandle}@${inboundDomain}` : undefined;
  const headers = channel === "EMAIL" && inReplyTo ? { "In-Reply-To": inReplyTo, References: inReplyTo } : undefined;
  const result = await sendOnChannel({ channel, to, body, subject, fromName: businessName, replyTo, headers, from });
  if (!result.ok) {
    await reportFailure("delivery", `${channel} send failed`, { businessId, provider: channel, error: result.error });
    return { status: "FAILED", error: scrubMetaMessage(result.error), statusDetail: "provider_rejected", via: "provider" };
  }
  if (result.simulated) return { status: "NOT_DELIVERED", error: `${channelLabel(channel)} isn't connected on this deployment.`, statusDetail: "not_connected", via: "none" };
  return { status: "SENT", providerMessageId: result.providerMessageId, statusDetail: "accepted", via: channel === "SMS" ? "sms" : "provider" };
}

export function channelLabel(channel: ChannelType): string {
  return { EMAIL: "Email", SMS: "SMS", WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", WEBSITE: "Website", PHONE: "Phone" }[channel];
}
