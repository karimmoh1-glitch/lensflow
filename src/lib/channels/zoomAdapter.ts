import type { ChannelAdapter, ChannelCapabilities, OutboundMessage, SendResult } from "./types";
import { zoomConfigured, zoomWebhooksConfigured } from "@/lib/zoom";

/**
 * Zoom Team Chat is a per-business connection: each workspace connects its own Zoom user,
 * and replies go out as that user with that workspace's token. Like WhatsApp and Instagram,
 * the send path lives in `src/server/deliver.ts`, which reads the workspace's connection.
 *
 * `live` says whether this deployment has the Zoom app and its webhook secret configured —
 * not whether any particular business has connected.
 */
export class ZoomAdapter implements ChannelAdapter {
  readonly channel = "ZOOM" as const;

  capabilities(): ChannelCapabilities {
    const configured = zoomConfigured() && zoomWebhooksConfigured();
    return {
      canSend: configured,
      canReceive: configured,
      live: configured,
      setupNote: configured
        ? "Each business connects its own Zoom account from Settings → Integrations; direct messages from people outside that Zoom account arrive on the Zoom webhook."
        : "Set ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET and ZOOM_WEBHOOK_SECRET_TOKEN, and point the Zoom app's event subscription at /api/webhooks/zoom.",
    };
  }

  async send(_message: OutboundMessage): Promise<SendResult> {
    return { ok: false, error: "Zoom Chat messages are sent as the business's own connected Zoom user — see server/deliver.ts." };
  }
}
