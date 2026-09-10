import type { IntegrationProvider, IntegrationStatus } from "@prisma/client";
import { metaProductReady } from "@/lib/meta/config";
import { providerMaturity, type Maturity } from "@/lib/integrations/flags";

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
  | "IMPORT_BOOKINGS"
  | "RECORD_PAYMENTS"
  | "FILES"
  | "NOTIFY"
  | "WEBHOOKS"
  | "POLLING"
  | "MEDIA"
  | "THREADS"
  | "DELIVERY_STATUS";

export type AuthKind = "oauth" | "app_password" | "platform" | "none";
export type ProviderKind = "channel" | "calendar" | "site" | "payments" | "files" | "notifications" | "scheduling";
export type Group = "communication" | "scheduling" | "payments" | "files" | "business";

export type ProviderSpec = {
  key: IntegrationProvider;
  name: string;
  kind: ProviderKind;
  group: Group;
  auth: AuthKind;
  capabilities: Capability[];
  /** Env vars Daythread's operator must set (names only). */
  env: string[];
  /** External approval beyond configuration, when the provider requires one. */
  approval?: string;
  summary: string;
  /** Where the operator's setup notes live. */
  docs?: string;
};

export type RegisteredProvider = Exclude<IntegrationProvider, "CALENDAR" | "PHONE">;

export const PROVIDERS: Record<RegisteredProvider, ProviderSpec> = {
  EMAIL: {
    key: "EMAIL",
    name: "Gmail",
    kind: "channel",
    group: "communication",
    auth: "oauth",
    capabilities: ["READ_MESSAGES", "SEND_MESSAGES", "THREADS", "POLLING"],
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    approval: "Google OAuth verification is required before accounts outside the app's test users can connect (Gmail scopes are 'restricted').",
    summary: "Your inbox, read and replied to from Daythread.",
  },
  MICROSOFT_OUTLOOK: {
    key: "MICROSOFT_OUTLOOK",
    name: "Microsoft Outlook",
    kind: "channel",
    group: "communication",
    auth: "oauth",
    capabilities: ["READ_MESSAGES", "SEND_MESSAGES", "THREADS", "POLLING"],
    env: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    approval: "A Microsoft Entra app registration with Mail.Read, Mail.Send, offline_access and User.Read delegated permissions. Work accounts may need an admin's consent; personal Outlook.com accounts connect directly.",
    summary: "Outlook mail, read and replied to from Daythread.",
    docs: "docs/integrations/microsoft.md",
  },
  INSTAGRAM: {
    key: "INSTAGRAM",
    name: "Instagram",
    kind: "channel",
    group: "communication",
    auth: "oauth",
    capabilities: ["READ_MESSAGES", "SEND_MESSAGES", "THREADS", "WEBHOOKS", "MEDIA"],
    env: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "NEXT_PUBLIC_APP_URL"],
    approval: "Meta App Review for instagram_business_manage_messages. Until approved, only accounts added as testers on the Meta app can connect. Professional (Business or Creator) accounts only.",
    summary: "DMs to your professional account, in one thread with everything else.",
    docs: "docs/integrations/meta.md",
  },
  WHATSAPP: {
    key: "WHATSAPP",
    name: "WhatsApp",
    kind: "channel",
    group: "communication",
    auth: "oauth",
    capabilities: ["READ_MESSAGES", "SEND_MESSAGES", "WEBHOOKS", "MEDIA", "DELIVERY_STATUS"],
    env: ["META_APP_ID", "META_APP_SECRET", "WHATSAPP_CONFIG_ID", "META_WEBHOOK_VERIFY_TOKEN", "NEXT_PUBLIC_APP_URL"],
    approval: "WhatsApp Business Platform (Cloud API) via Meta's Embedded Signup: needs a Meta Business, a phone number not on the consumer app, and Business verification for volume beyond the starter tier. Free-form replies only within 24h of the customer's last message; anything later needs an approved template.",
    summary: "WhatsApp Business messages, with real delivery and read receipts.",
    docs: "docs/integrations/meta.md",
  },
  SMS: {
    key: "SMS",
    name: "Messages (SMS)",
    kind: "channel",
    group: "communication",
    auth: "platform",
    capabilities: ["READ_MESSAGES", "SEND_MESSAGES", "WEBHOOKS", "DELIVERY_STATUS"],
    env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    summary: "A dedicated business number. Texts arrive here; replies go from it.",
    docs: "docs/integrations/twilio.md",
  },
  GOOGLE_CALENDAR: {
    key: "GOOGLE_CALENDAR",
    name: "Google Calendar",
    kind: "calendar",
    group: "scheduling",
    auth: "oauth",
    capabilities: ["READ_CALENDAR", "CREATE_EVENTS", "UPDATE_EVENTS", "DELETE_EVENTS", "POLLING"],
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    approval: "Google OAuth verification for the calendar scope (sensitive) before accounts outside the app's test users can connect.",
    summary: "Bookings appear on your calendar; busy time on it can't be double-booked.",
  },
  MICROSOFT_CALENDAR: {
    key: "MICROSOFT_CALENDAR",
    name: "Microsoft Calendar",
    kind: "calendar",
    group: "scheduling",
    auth: "oauth",
    capabilities: ["READ_CALENDAR", "CREATE_EVENTS", "UPDATE_EVENTS", "DELETE_EVENTS", "POLLING"],
    env: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    approval: "The same Microsoft Entra app registration as Outlook, with Calendars.ReadWrite delegated permission.",
    summary: "Outlook calendar: bookings go out, busy time comes in.",
    docs: "docs/integrations/microsoft.md",
  },
  APPLE_CALENDAR: {
    key: "APPLE_CALENDAR",
    name: "Apple Calendar",
    kind: "calendar",
    group: "scheduling",
    auth: "app_password",
    capabilities: ["READ_CALENDAR", "CREATE_EVENTS", "UPDATE_EVENTS", "DELETE_EVENTS", "POLLING"],
    env: [],
    summary: "iCloud Calendar over CalDAV, with an app-specific password you can revoke any time.",
  },
  CALENDLY: {
    key: "CALENDLY",
    name: "Calendly",
    kind: "scheduling",
    group: "scheduling",
    auth: "oauth",
    capabilities: ["IMPORT_BOOKINGS", "WEBHOOKS", "POLLING"],
    env: ["CALENDLY_CLIENT_ID", "CALENDLY_CLIENT_SECRET"],
    approval: "A Calendly OAuth app (developer.calendly.com). Instant updates by webhook need a Calendly Standard plan or higher; other plans are checked on open and daily.",
    summary: "Meetings booked through Calendly become Daythread bookings, matched to the person who booked.",
    docs: "docs/integrations/calendly.md",
  },
  STRIPE: {
    key: "STRIPE",
    name: "Stripe",
    kind: "payments",
    group: "payments",
    auth: "oauth",
    capabilities: ["RECORD_PAYMENTS", "WEBHOOKS"],
    env: ["STRIPE_SECRET_KEY", "STRIPE_CONNECT_CLIENT_ID", "STRIPE_CONNECT_WEBHOOK_SECRET"],
    approval: "Stripe Connect enabled on Daythread's Stripe account (Standard accounts, OAuth). Businesses keep their own Stripe account and payouts; Daythread only reads successful payments.",
    summary: "Payments to your own Stripe account, recorded against the person who paid.",
    docs: "docs/integrations/stripe.md",
  },
  GOOGLE_DRIVE: {
    key: "GOOGLE_DRIVE",
    name: "Google Drive",
    kind: "files",
    group: "files",
    auth: "oauth",
    capabilities: ["FILES"],
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    approval: "The Google Drive API enabled on the same Google Cloud project. The drive.file scope is non-sensitive: Daythread only sees folders and files it created.",
    summary: "A Daythread folder in your Drive, with a folder per client.",
    docs: "docs/integrations/files.md",
  },
  DROPBOX: {
    key: "DROPBOX",
    name: "Dropbox",
    kind: "files",
    group: "files",
    auth: "oauth",
    capabilities: ["FILES"],
    env: ["DROPBOX_APP_KEY", "DROPBOX_APP_SECRET"],
    approval: "A Dropbox app with App folder access and the files.content.write, files.metadata.read and sharing.write scopes. Until Dropbox approves production status, only 50 users can connect.",
    summary: "A Daythread app folder in your Dropbox, with a folder per client.",
    docs: "docs/integrations/files.md",
  },
  WEBSITE: {
    key: "WEBSITE",
    name: "Daythread Forms",
    kind: "site",
    group: "business",
    auth: "none",
    capabilities: ["READ_MESSAGES"],
    env: [],
    summary: "Your public booking page and contact form. Always on.",
  },
  SLACK: {
    key: "SLACK",
    name: "Slack",
    kind: "notifications",
    group: "business",
    auth: "oauth",
    capabilities: ["NOTIFY"],
    env: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
    approval: "A Slack app with the chat:write and channels:read bot scopes, installed to the workspace by a member who can add apps.",
    summary: "New inquiries and bookings posted to a channel you choose. Names and channels only, never the message itself.",
    docs: "docs/integrations/slack.md",
  },
};

export const CHANNEL_PROVIDERS: IntegrationProvider[] = ["EMAIL", "MICROSOFT_OUTLOOK", "INSTAGRAM", "WHATSAPP", "SMS", "WEBSITE"];
export const CALENDAR_PROVIDERS: IntegrationProvider[] = ["GOOGLE_CALENDAR", "MICROSOFT_CALENDAR", "APPLE_CALENDAR"];

/** The hub, in order. Every registered provider appears in exactly one group. */
export const GROUPS: Array<{ key: Group; title: string; hint: string; providers: RegisteredProvider[] }> = [
  { key: "communication", title: "Communication", hint: "Where conversations come from", providers: ["EMAIL", "MICROSOFT_OUTLOOK", "SMS", "INSTAGRAM", "WHATSAPP"] },
  { key: "scheduling", title: "Scheduling", hint: "Bookings go out; busy time comes in", providers: ["GOOGLE_CALENDAR", "MICROSOFT_CALENDAR", "APPLE_CALENDAR", "CALENDLY"] },
  { key: "payments", title: "Payments", hint: "Money in, matched to the person who paid", providers: ["STRIPE"] },
  { key: "files", title: "Files", hint: "A folder per client, where your files already live", providers: ["GOOGLE_DRIVE", "DROPBOX"] },
  { key: "business", title: "Business", hint: "Forms and alerts", providers: ["WEBSITE", "SLACK"] },
];

export function isRegisteredProvider(p: string): p is RegisteredProvider {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, p);
}

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

export { providerMaturity };
export type { Maturity };

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
