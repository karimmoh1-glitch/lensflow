import type { ChannelAdapter, ChannelCapabilities, OutboundMessage, SendResult } from "./types";

/**
 * The website lead form is genuinely functional inbound — see
 * src/app/actions/websiteLead.ts and /embed/[handle]/page.tsx. There's no legitimate
 * "send back to a public form" concept, so outbound here always falls through to the
 * business's email address via the reply flow in the inbox, not this adapter directly.
 */
export class WebsiteAdapter implements ChannelAdapter {
  readonly channel = "WEBSITE" as const;

  capabilities(): ChannelCapabilities {
    return {
      canSend: false,
      canReceive: true,
      live: true,
      setupNote: "Live — embed the lead form link below on your own site.",
    };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    console.log(`[website-adapter] no outbound channel for website leads: ${message.body}`);
    return { ok: true, simulated: true };
  }
}
