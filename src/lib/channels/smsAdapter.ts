import type { ChannelAdapter, ChannelCapabilities, OutboundMessage, SendResult } from "./types";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;
const configured = Boolean(accountSid && authToken && fromNumber);

/**
 * Real Twilio integration, not a stub — send() genuinely calls the Twilio API when
 * credentials are present. Inbound SMS arrives at /api/webhooks/twilio/sms, which Twilio
 * calls directly (no polling). Both directions are production-ready code; only the
 * account credentials are missing in this environment.
 */
export class SmsAdapter implements ChannelAdapter {
  readonly channel = "SMS" as const;

  capabilities(): ChannelCapabilities {
    return {
      canSend: true,
      canReceive: true,
      live: configured,
      setupNote: configured
        ? "Sending live via Twilio."
        : "Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER, then point your Twilio number's messaging webhook at /api/webhooks/twilio/sms.",
    };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (!configured || !message.to) {
      console.log(`[sms-adapter:demo] to ${message.to ?? "unknown"}: ${message.body}`);
      return { ok: true, simulated: true };
    }
    try {
      // Lazy import so the twilio SDK only initializes when actually configured.
      const twilio = (await import("twilio")).default;
      const client = twilio(accountSid, authToken);
      await client.messages.create({ to: message.to, from: fromNumber, body: message.body });
      return { ok: true, simulated: false };
    } catch (err) {
      console.error("[sms-adapter] twilio send failed", err);
      return { ok: false, error: "SMS provider error" };
    }
  }
}
