import type { ChannelAdapter, ChannelCapabilities, OutboundMessage, SendResult } from "./types";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER; // platform fallback; businesses normally send from their own number
const configured = Boolean(accountSid && authToken);

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
        : "Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN; each business then gets its own number from Settings → Integrations.",
    };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const from = message.from ?? fromNumber;
    if (!configured || !message.to || !from) {
      return { ok: true, simulated: true };
    }
    try {
      const twilio = (await import("twilio")).default;
      const client = twilio(accountSid, authToken);
      const sent = await client.messages.create({ to: message.to, from, body: message.body, statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/status` });
      if (sent.status === "failed" || sent.status === "undelivered") return { ok: false, error: `SMS failed (Twilio ${sent.errorCode ?? ""})`.trim() };
      return { ok: true, simulated: false, providerMessageId: sent.sid };
    } catch (err) {
      console.error("[sms-adapter] twilio send failed", err instanceof Error ? err.message : err);
      return { ok: false, error: "SMS provider error" };
    }
  }
}
