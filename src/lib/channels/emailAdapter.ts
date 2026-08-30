import { Resend } from "resend";
import type { ChannelAdapter, ChannelCapabilities, OutboundMessage, SendResult } from "./types";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

/**
 * Outbound is genuinely live once RESEND_API_KEY is set — no simulation involved.
 * Inbound (receiving replies into the unified inbox) needs a verified sending domain
 * with Resend's inbound-routing webhook pointed at /api/webhooks/email — see that route
 * for the receiving side. Both halves are real, working code; only the domain
 * verification step needs a business's own domain to complete.
 */
export class EmailAdapter implements ChannelAdapter {
  readonly channel = "EMAIL" as const;

  capabilities(): ChannelCapabilities {
    return {
      canSend: true,
      canReceive: true,
      live: Boolean(resend),
      setupNote: resend
        ? "Sending live via Resend."
        : "Add RESEND_API_KEY to send real emails. For inbound replies, verify a sending domain with Resend and point its inbound webhook at /api/webhooks/email.",
    };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (resend && message.to) {
      try {
        await resend.emails.send({
          from: "LensFlow <onboarding@resend.dev>",
          to: message.to,
          subject: message.subject || "Re: your inquiry",
          text: message.body,
        });
        return { ok: true, simulated: false };
      } catch (err) {
        console.error("[email-adapter] resend send failed", err);
        return { ok: false, error: "Email provider error" };
      }
    }
    console.log(`[email-adapter:demo] to ${message.to ?? "unknown"}: ${message.body}`);
    return { ok: true, simulated: true };
  }
}
