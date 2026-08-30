import type { ChannelAdapter, ChannelCapabilities, OutboundMessage, SendResult } from "./types";

/**
 * Not connected to real Instagram — and cannot be, without a registered Meta app.
 *
 * What's actually required to go live: Instagram messaging is exposed through the
 * Meta "Instagram Messaging API," which requires (1) a Facebook Page linked to a
 * Professional/Business Instagram account, (2) a Meta developer app with the
 * instagram_manage_messages permission, which needs App Review before it works for
 * accounts outside the developer's own team, and (3) a webhook subscription for
 * inbound messages. None of that can be provisioned from inside this codebase — it
 * needs a real Meta Business account and a completed review process.
 */
export class InstagramAdapter implements ChannelAdapter {
  readonly channel = "INSTAGRAM" as const;

  capabilities(): ChannelCapabilities {
    return {
      canSend: false,
      canReceive: false,
      live: false,
      setupNote:
        "Requires a Meta Business app with instagram_manage_messages access (subject to Meta App Review) and a Professional Instagram account linked to a Facebook Page.",
    };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    console.log(`[instagram-adapter:demo] to ${message.to ?? "unknown"}: ${message.body}`);
    return { ok: true, simulated: true };
  }
}
