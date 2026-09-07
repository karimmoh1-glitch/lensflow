import type { ChannelAdapter, ChannelCapabilities, OutboundMessage, SendResult } from "./types";
import { whatsappConfigured } from "@/lib/meta/whatsapp";

/**
 * WhatsApp Business Platform (Cloud API) is a per-business connection: each workspace
 * onboards its own WhatsApp Business Account and phone number through Meta's Embedded
 * Signup, and sends go out from that number with that workspace's token. The send path
 * therefore lives in `src/server/deliver.ts`, which also enforces the 24-hour customer
 * service window before anything leaves.
 *
 * `live` says whether the deployment has the Meta app and Embedded Signup configuration —
 * not whether any particular business has connected.
 */
export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel = "WHATSAPP" as const;

  capabilities(): ChannelCapabilities {
    const configured = whatsappConfigured();
    return {
      canSend: configured,
      canReceive: configured,
      live: configured,
      setupNote: configured
        ? "Each business connects its own WhatsApp Business number from Settings → Channels; messages and delivery receipts arrive on the Meta webhook."
        : "Set META_APP_ID, META_APP_SECRET, WHATSAPP_CONFIG_ID and META_WEBHOOK_VERIFY_TOKEN, and point the Meta app's webhook at /api/webhooks/meta.",
    };
  }

  async send(_message: OutboundMessage): Promise<SendResult> {
    return { ok: false, error: "WhatsApp messages are sent from the business's own connected number — see server/deliver.ts." };
  }
}
