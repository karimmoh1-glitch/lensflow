import type { IntegrationProvider, IntegrationStatus } from "@prisma/client";
import { metaProductReady } from "@/lib/meta/config";

/**
 * What each channel is, what it can genuinely do, and what has to be true on this
 * deployment for it to work. Capabilities are declared per provider from the provider's
 * documented API — never claimed beyond what is implemented and supported.
 */
export type Capability =
  | "READ_MESSAGES"
  | "SEND_MESSAGES"
  | "READ_CONTACTS"
  | "WEBHOOKS"
  | "POLLING"
  | "MEDIA"
  | "THREADS"
  | "DELIVERY_STATUS";

export type AuthKind = "oauth" | "platform" | "none";

export type ProviderSpec = {
  key: IntegrationProvider;
  name: string;
  kind: "channel" | "site";
  auth: AuthKind;
  capabilities: Capability[];
  /** Env vars Daythread's operator must set (names only). */
  env: string[];
  /** External approval beyond configuration, when the provider requires one. */
  approval?: string;
  summary: string;
};

export const PROVIDERS: Record<Exclude<IntegrationProvider, "CALENDAR" | "PHONE" | "GOOGLE_CALENDAR" | "APPLE_CALENDAR" | "STRIPE">, ProviderSpec> = {
  EMAIL: {
    key: "EMAIL",
    name: "Gmail",
    kind: "channel",
    auth: "oauth",
    capabilities: ["READ_MESSAGES", "SEND_MESSAGES", "THREADS", "POLLING"],
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    approval: "Google OAuth verification is required before accounts outside the app's test users can connect (Gmail scopes are 'restricted').",
    summary: "Your inbox, read and replied to from Daythread.",
  },
  INSTAGRAM: {
    key: "INSTAGRAM",
    name: "Instagram",
    kind: "channel",
    auth: "oauth",
    capabilities: ["READ_MESSAGES", "SEND_MESSAGES", "THREADS", "WEBHOOKS", "MEDIA"],
    env: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "NEXT_PUBLIC_APP_URL"],
    approval: "Meta App Review for instagram_business_manage_messages. Until approved, only accounts added as testers on the Meta app can connect. Professional (Business or Creator) accounts only.",
    summary: "DMs to your professional account, in one thread with everything else.",
  },
  WHATSAPP: {
    key: "WHATSAPP",
    name: "WhatsApp",
    kind: "channel",
    auth: "oauth",
    capabilities: ["READ_MESSAGES", "SEND_MESSAGES", "WEBHOOKS", "MEDIA", "DELIVERY_STATUS"],
    env: ["META_APP_ID", "META_APP_SECRET", "WHATSAPP_CONFIG_ID", "META_WEBHOOK_VERIFY_TOKEN", "NEXT_PUBLIC_APP_URL"],
    approval: "WhatsApp Business Platform (Cloud API) via Meta's Embedded Signup: needs a Meta Business, a phone number not on the consumer app, and Business verification for volume beyond the starter tier. Free-form replies only within 24h of the customer's last message; anything later needs an approved template.",
    summary: "WhatsApp Business messages, with real delivery and read receipts.",
  },
  SMS: {
    key: "SMS",
    name: "Messages (SMS)",
    kind: "channel",
    auth: "platform",
    capabilities: ["READ_MESSAGES", "SEND_MESSAGES", "WEBHOOKS", "DELIVERY_STATUS"],
    env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    summary: "A dedicated business number. Texts arrive here; replies go from it.",
  },
  WEBSITE: {
    key: "WEBSITE",
    name: "Contact form",
    kind: "site",
    auth: "none",
    capabilities: ["READ_MESSAGES"],
    env: [],
    summary: "A contact form for your site. Always on.",
  },
};

export const CHANNEL_PROVIDERS: IntegrationProvider[] = ["EMAIL", "INSTAGRAM", "WHATSAPP", "SMS", "WEBSITE"];

/**
 * Whether the deployment has what this provider needs. Never returns a value, only whether
 * one is present and well-formed. Meta's two providers defer to the Meta configuration
 * layer, which is the single authority on what "configured" means for them (it also
 * validates shape and rejects a localhost or preview app URL that Meta could never call).
 */
export function providerConfigured(spec: ProviderSpec): boolean {
  if (spec.key === "INSTAGRAM") return metaProductReady("instagram");
  if (spec.key === "WHATSAPP") return metaProductReady("whatsapp");
  return spec.env.every((k) => Boolean(process.env[k]));
}

export type DisplayStatus = "connected" | "needs_attention" | "sync_issue" | "disconnected" | "unavailable" | "always_on";

/** The display state of an integration row, derived — never a toggle. */
export function displayStatus(spec: ProviderSpec, row: { status: IntegrationStatus; refreshToken?: string | null; accessToken?: string | null; lastSyncStatus?: string | null } | null | undefined, configured: boolean): DisplayStatus {
  if (spec.auth === "none") return "always_on";
  if (!configured) return "unavailable";
  if (!row) return "disconnected";
  if (row.status === "NEEDS_ATTENTION") return "needs_attention";
  if (row.status === "SYNC_ERROR") return "sync_issue";
  if (row.status === "CONNECTED") {
    if (spec.auth === "oauth" && !row.refreshToken && !row.accessToken) return "needs_attention";
    return row.lastSyncStatus === "failed" ? "sync_issue" : "connected";
  }
  return "disconnected";
}
