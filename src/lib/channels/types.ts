import type { ChannelType } from "@prisma/client";

export type ChannelCapabilities = {
  /** Can this adapter actually deliver an outbound message right now? */
  canSend: boolean;
  /** Can this channel receive inbound messages (webhook or form) at all, ever? */
  canReceive: boolean;
  /** True only when real provider credentials are configured — never faked. */
  live: boolean;
  /** Human-readable note on what's required to go live, shown in Settings → Integrations. */
  setupNote: string;
};

export type OutboundMessage = {
  to: string | null;
  body: string;
  subject?: string;
};

export type SendResult = { ok: true; simulated: boolean } | { ok: false; error: string };

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
