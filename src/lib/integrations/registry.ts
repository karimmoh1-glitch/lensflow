import type { IntegrationProvider, IntegrationStatus } from "@prisma/client";

/**
 * What each integration is, what it can genuinely do, and what has to be true on this
 * deployment for it to work. Capabilities are declared per provider from the provider's
 * documented API — never claimed beyond what is implemented and supported.
 */
export type Capability =
  | "READ_MESSAGES"
  | "SEND_MESSAGES"
  | "READ_CONTACTS"
  | "READ_CALENDAR"
  | "CREATE_EVENTS"
  | "UPDATE_EVENTS"
  | "DELETE_EVENTS"
  | "WEBHOOKS"
  | "POLLING"
  | "MEDIA"
  | "THREADS"
  | "DELIVERY_STATUS";

export type AuthKind = "oauth" | "app_password" | "platform" | "none";

export type ProviderSpec = {
  key: IntegrationProvider;
  name: string;
  kind: "channel" | "calendar" | "payments" | "site";
  auth: AuthKind;
  capabilities: Capability[];
  /** Env vars Daythread's operator must set (names only). */
  env: string[];
  /** External approval beyond configuration, when the provider requires one. */
  approval?: string;
  summary: string;
};

export const PROVIDERS: Record<Exclude<IntegrationProvider, "CALENDAR" | "PHONE">, ProviderSpec> = {
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
    env: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN"],
    approval: "Meta App Review for instagram_business_manage_messages. Until approved, only accounts added as testers on the Meta app can connect. Professional (Business or Creator) accounts only.",
    summary: "DMs to your professional account, in one thread with everything else.",
  },
  WHATSAPP: {
    key: "WHATSAPP",
    name: "WhatsApp",
    kind: "channel",
    auth: "oauth",
    capabilities: ["READ_MESSAGES", "SEND_MESSAGES", "WEBHOOKS", "MEDIA", "DELIVERY_STATUS"],
    env: ["META_APP_ID", "META_APP_SECRET", "WHATSAPP_CONFIG_ID", "META_WEBHOOK_VERIFY_TOKEN"],
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
  GOOGLE_CALENDAR: {
    key: "GOOGLE_CALENDAR",
    name: "Google Calendar",
    kind: "calendar",
    auth: "oauth",
    capabilities: ["READ_CALENDAR", "CREATE_EVENTS", "UPDATE_EVENTS", "DELETE_EVENTS", "POLLING"],
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    approval: "Google OAuth verification for the calendar scope (sensitive) before accounts outside the app's test users can connect.",
    summary: "Bookings appear on your calendar; busy time on it can't be double-booked.",
  },
  APPLE_CALENDAR: {
    key: "APPLE_CALENDAR",
    name: "Apple Calendar",
    kind: "calendar",
    auth: "app_password",
    capabilities: ["READ_CALENDAR", "CREATE_EVENTS", "UPDATE_EVENTS", "DELETE_EVENTS", "POLLING"],
    env: [],
    summary: "iCloud Calendar over CalDAV, with an app-specific password you can revoke any time.",
  },
  WEBSITE: {
    key: "WEBSITE",
    name: "Booking page",
    kind: "site",
    auth: "none",
    capabilities: ["READ_MESSAGES"],
    env: [],
    summary: "Your public booking page. Always on.",
  },
  STRIPE: {
    key: "STRIPE",
    name: "Stripe",
    kind: "payments",
    auth: "platform",
    capabilities: ["WEBHOOKS"],
    env: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    summary: "Card deposits and balances, confirmed by Stripe. Payments are an outcome, not a channel.",
  },
};

export const CHANNEL_PROVIDERS: IntegrationProvider[] = ["EMAIL", "INSTAGRAM", "WHATSAPP", "SMS", "WEBSITE"];
export const CALENDAR_PROVIDERS: IntegrationProvider[] = ["GOOGLE_CALENDAR", "APPLE_CALENDAR"];

/** Whether the deployment has what this provider needs. Never reads a value, only presence. */
export function providerConfigured(spec: ProviderSpec): boolean {
  return spec.env.every((k) => Boolean(process.env[k]));
}

export type DisplayStatus = "connected" | "needs_attention" | "sync_issue" | "disconnected" | "unavailable" | "always_on";

/** The display state of an integration row, derived — never a toggle. */
export function displayStatus(spec: ProviderSpec, row: { status: IntegrationStatus; refreshToken?: string | null; accessToken?: string | null; lastSyncStatus?: string | null } | null | undefined, configured: boolean): DisplayStatus {
  if (spec.auth === "none") return "always_on";
  if (!configured && spec.auth !== "app_password") return "unavailable";
  if (!row) return "disconnected";
  if (row.status === "NEEDS_ATTENTION") return "needs_attention";
  if (row.status === "SYNC_ERROR") return "sync_issue";
  if (row.status === "CONNECTED") {
    if (spec.auth === "oauth" && !row.refreshToken && !row.accessToken) return "needs_attention";
    if (spec.auth === "app_password" && !row.accessToken) return "needs_attention";
    return row.lastSyncStatus === "failed" ? "sync_issue" : "connected";
  }
  return "disconnected";
}
