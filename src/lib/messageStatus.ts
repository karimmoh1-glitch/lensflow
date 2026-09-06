import type { ChannelType, MessageDirection, MessageStatus } from "@prisma/client";

/**
 * What a message's state actually says, in words. One place, so the thread, the mobile app
 * and any future surface all describe a delivery the same way — and so nothing ever reads
 * as "sent" that a provider did not accept.
 *
 * `statusDetail` is the provider's or the send path's own short reason: "accepted",
 * "delivered", "read", "window_closed", "not_connected", "reauth_required",
 * "provider_rejected", or a WhatsApp error like "131047 Re-engagement message". The status
 * enum stays the source of truth; the detail only sharpens the sentence.
 */
export type MessageStateTone = "sent" | "delivered" | "read" | "warning" | "danger" | "none";

export type MessageState = {
  tone: MessageStateTone;
  /** Short label in front of the timestamp ("Delivered", "Not delivered"). */
  label: string | null;
  /** The full explanation, when there is something a person should do about it. */
  detail: string | null;
};

const CHANNEL_LABEL: Record<ChannelType, string> = { EMAIL: "Email", SMS: "SMS", WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", WEBSITE: "Website", PHONE: "Phone" };

/**
 * Channels whose provider tells us what happened after the send. On those, "Sent" is the
 * first step of a progression the reader will watch (Sent → Delivered → Read), so it is
 * worth saying. On a channel with no receipts, "Sent" adds nothing a person didn't already
 * know from the message being in the thread — so it is left off rather than made into noise.
 */
const RECEIPT_CHANNELS: ChannelType[] = ["WHATSAPP", "SMS"];

export function messageState(message: { direction: MessageDirection; status: MessageStatus; statusDetail?: string | null; deliveredAt?: Date | null; readAt?: Date | null }, channel: ChannelType): MessageState {
  if (message.direction !== "OUTBOUND") return { tone: "none", label: null, detail: null };
  const detail = (message.statusDetail ?? "").trim();
  const channelName = CHANNEL_LABEL[channel];

  if (message.status === "FAILED") {
    return { tone: "danger", label: "Failed to send", detail: failureDetail(detail, channelName) };
  }
  if (message.status === "NOT_DELIVERED") {
    return { tone: "warning", label: "Not delivered", detail: notDeliveredDetail(detail, channelName) };
  }
  if (message.readAt || detail === "read") return { tone: "read", label: "Read", detail: null };
  if (message.deliveredAt || detail === "delivered") return { tone: "delivered", label: "Delivered", detail: null };
  if (message.status === "DELIVERED") return { tone: "delivered", label: "Delivered", detail: null };
  if (message.status === "SENT") return { tone: "sent", label: RECEIPT_CHANNELS.includes(channel) ? "Sent" : null, detail: null };
  return { tone: "none", label: null, detail: null };
}

function notDeliveredDetail(detail: string, channelName: string): string {
  switch (detail) {
    case "window_closed":
      return "WhatsApp only allows a free-form reply within 24 hours of the customer's last message. This was saved to the thread but not sent; an approved template is required after that.";
    case "reauth_required":
      return `${channelName} needs to be reconnected before replies can be sent. Reconnect it in Settings → Integrations.`;
    case "not_connected":
      return `${channelName} isn't connected, so nothing was sent.`;
    case "no_recipient":
      return "There is no address on this conversation to send to.";
    case "empty":
      return "There was nothing to send.";
    default:
      return `${channelName} did not deliver this message.`;
  }
}

function failureDetail(detail: string, channelName: string): string {
  // A WhatsApp status callback stores Meta's own code and title, e.g. "131047 Re-engagement message".
  if (/^131047\b/.test(detail)) return "WhatsApp rejected this: it fell outside the 24-hour customer service window, which only an approved template can cross.";
  if (/^13\d{4}\b/.test(detail)) return `WhatsApp rejected this message (${detail}).`;
  if (detail === "provider_rejected" || !detail) return `${channelName} rejected this message. Nothing was delivered.`;
  return `${channelName} rejected this message: ${detail}`;
}
