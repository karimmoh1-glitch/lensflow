import type { ChannelAdapter, ChannelCapabilities, OutboundMessage, SendResult } from "./types";
import { instagramConfigured } from "@/lib/meta/instagram";

/**
 * Instagram is a per-business connection, not a platform account: each workspace authorizes
 * its own professional account through Instagram Login, and sends go out with that
 * workspace's own token. That means the send path needs the business's Integration row, so
 * it lives in `src/server/deliver.ts` and this adapter never sends.
 *
 * `live` here says only whether the deployment has a Meta app configured at all — the thing
 * an operator controls. Whether a given business is connected is a property of its
 * Integration row, shown on its own card in Settings → Channels.
 */
export class InstagramAdapter implements ChannelAdapter {
  readonly channel = "INSTAGRAM" as const;

  capabilities(): ChannelCapabilities {
    const configured = instagramConfigured();
    return {
      canSend: configured,
      canReceive: configured,
      live: configured,
      setupNote: configured
        ? "Each business connects its own professional Instagram account from Settings → Channels; DMs arrive on the Meta webhook."
        : "Set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN, and point the Meta app's webhook at /api/webhooks/meta.",
    };
  }

  /** Never a simulated success: an Instagram send that did not go through the connected
   * account's own token did not happen. */
  async send(_message: OutboundMessage): Promise<SendResult> {
    return { ok: false, error: "Instagram messages are sent with the business's own connected account — see server/deliver.ts." };
  }
}
