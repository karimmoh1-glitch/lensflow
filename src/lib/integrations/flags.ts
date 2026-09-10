/**
 * Release stage of the integrations that are gated by a partner's approval, set by the
 * operator per deployment. Never a toggle the business can flip: a stage decides what the
 * hub offers, and the connect actions enforce the same stage on the server.
 *
 *   INTEGRATION_INSTAGRAM_MODE  invite (default) | open | off
 *   INTEGRATION_WHATSAPP_MODE   coming_soon (default) | open | off
 *
 * "invite" means a workspace must request access and a founder must approve it before
 * Connect appears. That gate sits in front of Meta's own requirements (app review, tester
 * roles), it never replaces them: an approved workspace still goes through Meta's real
 * authorization, and Meta still decides whether messages are delivered.
 */
export type InstagramMode = "invite" | "open" | "off";
export type WhatsAppMode = "coming_soon" | "open" | "off";

export function instagramMode(): InstagramMode {
  const v = (process.env.INTEGRATION_INSTAGRAM_MODE ?? "invite").trim().toLowerCase();
  return v === "open" || v === "off" ? v : "invite";
}

export function whatsappMode(): WhatsAppMode {
  const v = (process.env.INTEGRATION_WHATSAPP_MODE ?? "coming_soon").trim().toLowerCase();
  return v === "open" || v === "off" ? v : "coming_soon";
}

export type Maturity = "ga" | "beta" | "coming_soon" | "off";

/** The stage a provider is at on this deployment. Everything not gated is generally available. */
export function providerMaturity(provider: string): Maturity {
  if (provider === "INSTAGRAM") {
    const m = instagramMode();
    return m === "invite" ? "beta" : m === "open" ? "ga" : "off";
  }
  if (provider === "WHATSAPP") {
    const m = whatsappMode();
    return m === "coming_soon" ? "coming_soon" : m === "open" ? "ga" : "off";
  }
  return "ga";
}
