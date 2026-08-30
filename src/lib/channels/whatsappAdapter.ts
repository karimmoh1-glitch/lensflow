import type { ChannelAdapter, ChannelCapabilities, OutboundMessage, SendResult } from "./types";

/**
 * Not connected to real WhatsApp. WhatsApp Business Platform (Cloud API) is the only
 * legitimate route — no scraping, no unofficial automation tools. Going live requires
 * a Meta Business verification, a registered WhatsApp phone number, and pre-approved
 * message templates for any conversation the business initiates (a 24-hour customer
 * service window applies to free-form replies after a customer messages first). None
 * of that can be provisioned without a real, verified business.
 */
export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel = "WHATSAPP" as const;

  capabilities(): ChannelCapabilities {
    return {
      canSend: false,
      canReceive: false,
      live: false,
      setupNote:
        "Requires Meta Business verification, a registered WhatsApp Business number, and approved message templates via the WhatsApp Cloud API.",
    };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    console.log(`[whatsapp-adapter:demo] to ${message.to ?? "unknown"}: ${message.body}`);
    return { ok: true, simulated: true };
  }
}
