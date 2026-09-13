import { PROVIDERS, providerConfigured, providerMaturity, type RegisteredProvider } from "@/lib/integrations/registry";
import type { ChannelKey } from "./ChannelIcon";

/**
 * What this deployment can honestly say about a channel today. Read from the same
 * registry and environment the product uses, so the landing page can never claim a
 * connection a customer can't make: not configured or not released → "Coming soon".
 */
export type ChannelStatus = "Live" | "Beta" | "Coming soon";

export function channelStatus(provider: RegisteredProvider | null): ChannelStatus {
  if (!provider) return "Live";
  const maturity = providerMaturity(provider);
  if (maturity === "off" || maturity === "coming_soon" || !providerConfigured(PROVIDERS[provider])) return "Coming soon";
  return maturity === "beta" ? "Beta" : "Live";
}

export const CHANNEL_PROVIDER: Record<ChannelKey, RegisteredProvider | null> = {
  instagram: "INSTAGRAM",
  gmail: "EMAIL",
  sms: "SMS",
  whatsapp: "WHATSAPP",
  website: null,
};

/** Every landing-page channel with its status, for components that draw them. */
export function channelStatuses(): Record<ChannelKey, ChannelStatus> {
  return Object.fromEntries((Object.keys(CHANNEL_PROVIDER) as ChannelKey[]).map((k) => [k, channelStatus(CHANNEL_PROVIDER[k])])) as Record<ChannelKey, ChannelStatus>;
}
