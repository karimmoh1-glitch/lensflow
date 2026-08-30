import { Resend } from "resend";
import type { ChannelAdapter, ChannelCapabilities, OutboundMessage, SendResult } from "./types";

const apiKey = process.env.RESEND_API_KEY;
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const resend = apiKey ? new Resend(apiKey) : null;

/**
 * Real, not simulated, once both env vars are set — there is no per-business OAuth
 * step for email the way there would be for Instagram. LensFlow holds one Resend
 * account; every business's inbound address is `<handle>@RESEND_INBOUND_DOMAIN`
 * (see /api/webhooks/email for the receiving side, which routes purely off that
 * local-part, so it never needs to know the domain itself).
 *
 * canSend only needs the API key. canReceive needs the webhook secret too, since
 * without it the webhook route refuses every request (501) — no point claiming
 * receiving works when the other half of the round trip can't verify its caller.
 * "live" — the only state the Connections page will ever show as "✓ Connected" —
 * requires both, because a business relying on this to run their inbox needs the
 * whole loop working, not half of it.
 */
export class EmailAdapter implements ChannelAdapter {
  readonly channel = "EMAIL" as const;

  capabilities(): ChannelCapabilities {
    const canSend = Boolean(resend);
    const canReceive = Boolean(resend && webhookSecret);
    return {
      canSend,
      canReceive,
      live: canSend && canReceive,
      setupNote: canSend
        ? canReceive
          ? "Sending and receiving live via Resend."
          : "Sending is live. Add RESEND_WEBHOOK_SECRET (from a Resend webhook subscribed to email.received, pointed at /api/webhooks/email) to receive replies into the inbox."
        : "Add RESEND_API_KEY to send real emails. For inbound replies, also set RESEND_WEBHOOK_SECRET and RESEND_INBOUND_DOMAIN.",
    };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (resend && message.to) {
      try {
        const from = message.fromName ? `${message.fromName} <${fromAddress}>` : fromAddress;
        const { data, error } = await resend.emails.send({
          from,
          to: message.to,
          subject: message.subject || "Re: your inquiry",
          text: message.body,
          replyTo: message.replyTo,
          headers: message.headers,
        });
        if (error || !data) {
          console.error("[email-adapter] resend send failed", error);
          return { ok: false, error: error?.message || "Email provider error" };
        }
        return { ok: true, simulated: false, providerMessageId: data.id };
      } catch (err) {
        console.error("[email-adapter] resend send failed", err);
        return { ok: false, error: "Email provider error" };
      }
    }
    console.log(`[email-adapter:demo] to ${message.to ?? "unknown"}: ${message.body}`);
    return { ok: true, simulated: true };
  }
}
