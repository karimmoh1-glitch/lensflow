import type { ChannelType } from "@prisma/client";

export type ChannelCapabilities = {
  /** Can this adapter actually deliver an outbound message right now? */
  canSend: boolean;
  /** Can this channel receive inbound messages (webhook or form) at all, ever? */
  canReceive: boolean;
  /** True only when real provider credentials are configured — never faked. */
  live: boolean;
  /** Human-readable note on what's required to go live, shown in Settings → Channels. */
  setupNote: string;
};

export type OutboundMessage = {
  to: string | null;
  body: string;
  subject?: string;
  /** Display name to send as (e.g. the business name) — the address itself stays
   * whatever the adapter/provider allows sending from. */
  fromName?: string;
  /** Where the recipient's reply should actually land — for email this is the
   * business's real inbound routing address, so hitting "Reply" in Gmail comes back
   * through the webhook instead of nowhere. */
  replyTo?: string;
  /** Raw provider headers, e.g. In-Reply-To / References for email threading. */
  headers?: Record<string, string>;
  /** The business's own sending identity on this channel (its Twilio number). */
  from?: string | null;
  /** An HTML part for channels that render one. Text stays the source of truth: any channel
   * that cannot show markup sends `body`, and the two always say the same thing. */
  html?: string;
};

export type SendResult =
  | {
      ok: true;
      /** True when nothing actually left the building: the channel isn't connected, or the
       * provider's own rules (WhatsApp's 24-hour window) forbid this send. `reason` says
       * which, in words a person can act on — the UI must never call this "sent". */
      simulated: boolean;
      providerMessageId?: string;
      reason?: string;
    }
  | { ok: false; error: string };

/** One normalized shape for a message arriving from any channel — the unified inbox never
 * needs to know which platform a message came from beyond this. */
export type NormalizedInboundMessage = {
  channel: ChannelType;
  externalMessageId?: string;
  senderHandle: string;
  senderName?: string;
  body: string;
};

/**
 * Every channel — connected or not — implements this same interface. The inbox, the
 * settings page, and the outbound-send path all talk to adapters through here, never to
 * a specific provider SDK directly. Adding a new channel means adding a new adapter, not
 * touching the rest of the app.
 */
export interface ChannelAdapter {
  readonly channel: ChannelType;
  capabilities(): ChannelCapabilities;
  send(message: OutboundMessage): Promise<SendResult>;
}
