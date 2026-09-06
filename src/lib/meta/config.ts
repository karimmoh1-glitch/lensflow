/**
 * The one place that decides what Meta is configured for on this deployment.
 *
 * Every Meta code path — the Instagram start action, the WhatsApp start action, both
 * callbacks, the webhook and the Integrations UI — reads its answer from here, so there is
 * a single definition of "configured" rather than one per call site.
 *
 This module reads process.env and must only ever be imported from a Server Component, a
 * server action or a route handler. What crosses to the client is the *result* of
 * `metaConfigReport()`: booleans, labels and public URLs. No function here returns, logs or
 * embeds a secret value, so nothing sensitive can reach the browser even by accident.
 */

/** Every Meta environment variable Daythread reads, and what it is for. */
export const META_ENV = {
  META_APP_ID: "Meta app id (WhatsApp Embedded Signup, webhook app)",
  META_APP_SECRET: "Meta app secret (webhook signatures, token exchange)",
  META_WEBHOOK_VERIFY_TOKEN: "Shared token for Meta's webhook verification handshake",
  INSTAGRAM_APP_ID: "Instagram app id (Instagram API with Instagram Login)",
  INSTAGRAM_APP_SECRET: "Instagram app secret",
  WHATSAPP_CONFIG_ID: "Embedded Signup configuration id",
} as const;
export type MetaEnvKey = keyof typeof META_ENV;

export type SettingState = "configured" | "missing" | "invalid";

export type SettingReport = {
  key: MetaEnvKey | "NEXT_PUBLIC_APP_URL";
  label: string;
  state: SettingState;
  /** Why it reads as invalid — never the value itself. */
  note: string | null;
  secret: boolean;
  /**
   * Whether an "invalid" here stops the product being offered at all. A public URL Meta
   * could never call back is fatal: the flow would break at the redirect. An id or secret
   * that merely doesn't look the way Meta usually issues them is flagged loudly but not
   * blocked — Meta's formats change, and refusing to show a Connect button over a shape
   * guess would be worse than letting Meta reject a bad credential itself.
   */
  blocking: boolean;
};

export type MetaProductReport = {
  product: "instagram" | "whatsapp";
  name: string;
  /** Everything Daythread needs is present and well-formed. */
  ready: boolean;
  settings: SettingReport[];
  /** What is still required from Meta itself, which no environment variable can satisfy. */
  approval: string;
};

export type MetaConfigReport = {
  appUrl: SettingReport;
  webhookUrl: string;
  redirectUris: { instagram: string; whatsapp: string };
  webhookVerifyToken: SettingReport;
  products: MetaProductReport[];
  /** True when at least one Meta product can be connected on this deployment. */
  anyReady: boolean;
};

function value(key: string): string {
  return (process.env[key] ?? "").trim();
}

/** Present, and shaped the way Meta issues it. Never logs or returns the value. */
function report(key: MetaEnvKey, opts: { pattern?: RegExp; minLength?: number; secret?: boolean } = {}): SettingReport {
  const v = value(key);
  const base = { key, label: META_ENV[key], secret: opts.secret ?? false, blocking: false };
  if (!v) return { ...base, state: "missing", note: null };
  if (opts.pattern && !opts.pattern.test(v)) return { ...base, state: "invalid", note: "Present but not the shape Meta issues — check it was copied whole." };
  if (opts.minLength && v.length < opts.minLength) return { ...base, state: "invalid", note: `Present but shorter than ${opts.minLength} characters — check it was copied whole.` };
  return { ...base, state: "configured", note: null };
}

const NUMERIC_ID = /^\d{8,25}$/;
const APP_SECRET = /^[a-f0-9]{32}$/i;
const MIN_VERIFY_TOKEN = 8;

export function appUrlReport(): SettingReport {
  const v = value("NEXT_PUBLIC_APP_URL");
  const base = { key: "NEXT_PUBLIC_APP_URL" as const, label: "Public app URL (OAuth redirects and the webhook URL are built from it)", secret: false, blocking: true };
  if (!v) return { ...base, state: "missing", note: null };
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return { ...base, state: "invalid", note: "Not a valid absolute URL." };
  }
  if (process.env.NODE_ENV === "production") {
    if (url.protocol !== "https:") return { ...base, state: "invalid", note: "Meta only accepts https redirect URIs in production." };
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname)) return { ...base, state: "invalid", note: "Points at localhost, which Meta can never reach." };
    if (/\.vercel\.app$/i.test(url.hostname)) return { ...base, state: "invalid", note: "A preview deployment URL: it changes on every deploy, so Meta's saved redirect URI would stop matching. Set the production domain." };
  }
  return { ...base, state: "configured", note: null };
}

/** The absolute base every Meta URL is built from — always the configured public URL,
 * never the request's own host, so a preview or proxy host can never become a redirect. */
export function appBaseUrl(): string {
  return value("NEXT_PUBLIC_APP_URL").replace(/\/+$/, "");
}
export function metaWebhookUrl(): string {
  return `${appBaseUrl()}/api/webhooks/meta`;
}

export function metaConfigReport(): MetaConfigReport {
  const appUrl = appUrlReport();
  const verify = report("META_WEBHOOK_VERIFY_TOKEN", { minLength: MIN_VERIFY_TOKEN, secret: true });
  const instagram: MetaProductReport = {
    product: "instagram",
    name: "Instagram",
    ready: false,
    settings: [report("INSTAGRAM_APP_ID", { pattern: NUMERIC_ID }), report("INSTAGRAM_APP_SECRET", { pattern: APP_SECRET, secret: true }), verify, appUrl],
    approval:
      "Meta App Review for instagram_business_manage_messages. Until it is approved, only Instagram accounts added as testers on the app can connect, and only professional (Business or Creator) accounts.",
  };
  const whatsapp: MetaProductReport = {
    product: "whatsapp",
    name: "WhatsApp",
    ready: false,
    settings: [report("META_APP_ID", { pattern: NUMERIC_ID }), report("META_APP_SECRET", { pattern: APP_SECRET, secret: true }), report("WHATSAPP_CONFIG_ID", { pattern: NUMERIC_ID }), verify, appUrl],
    approval:
      "A Meta Business with Business verification, and a phone number that is not registered on the consumer WhatsApp app. Free-form replies are only allowed inside the 24-hour customer service window; anything later needs an approved template.",
  };
  // Ready means: nothing missing, and nothing invalid in a way that would actually break the
  // flow. A shape warning is shown, not enforced.
  for (const p of [instagram, whatsapp]) p.ready = p.settings.every((s) => s.state !== "missing" && !(s.state === "invalid" && s.blocking));
  return {
    appUrl,
    webhookUrl: `${appBaseUrl()}/api/webhooks/meta`,
    redirectUris: { instagram: `${appBaseUrl()}/api/auth/instagram/callback`, whatsapp: `${appBaseUrl()}/api/auth/whatsapp/callback` },
    webhookVerifyToken: verify,
    products: [instagram, whatsapp],
    anyReady: instagram.ready || whatsapp.ready,
  };
}

/**
 * Is this product connectable on this deployment right now? The authoritative answer, and
 * what the Connect button asks: it requires the whole setup, including the webhook token and
 * a public URL Meta could actually call back.
 */
export function metaProductReady(product: "instagram" | "whatsapp"): boolean {
  return metaConfigReport().products.find((p) => p.product === product)?.ready ?? false;
}

/**
 * The narrower question the OAuth callbacks ask: are the credentials needed to *complete* an
 * authorization present? A deployment can legitimately have working OAuth while its webhook
 * is still being wired up, and a flow already in progress should not be thrown away for a
 * setting that has nothing to do with exchanging the code. The full check above is what
 * decides whether a flow may be *started*.
 */
export function metaCredentialsPresent(product: "instagram" | "whatsapp"): boolean {
  return product === "instagram"
    ? Boolean(value("INSTAGRAM_APP_ID") && value("INSTAGRAM_APP_SECRET"))
    : Boolean(value("META_APP_ID") && value("META_APP_SECRET"));
}

/** Webhook receiving needs the verify token and at least one app secret; it is separate
 * from either product being fully configured. */
export function metaWebhookReady(): boolean {
  return Boolean(value("META_WEBHOOK_VERIFY_TOKEN") && (value("META_APP_SECRET") || value("INSTAGRAM_APP_SECRET")));
}

/**
 * The five states an integration row can be in, named the way the product talks about them.
 * Derived — never stored, never sent by a client, never a toggle.
 */
export type ConnectionState = "CONNECTED" | "NOT_CONNECTED" | "CONFIGURATION_REQUIRED" | "REAUTH_REQUIRED" | "ERROR";

export function connectionState(
  row: { status: string; accessToken?: string | null; refreshToken?: string | null; lastSyncStatus?: string | null } | null | undefined,
  configured: boolean
): ConnectionState {
  if (!configured) return "CONFIGURATION_REQUIRED";
  if (!row || row.status === "NOT_CONNECTED") return "NOT_CONNECTED";
  if (row.status === "NEEDS_ATTENTION") return "REAUTH_REQUIRED";
  if (row.status === "ERROR") return "ERROR";
  if (row.status === "CONNECTED" || row.status === "SYNC_ERROR") {
    // A row that says CONNECTED but holds no usable credential is not connected. A token
    // that fails to decrypt reads as null here, which is exactly this case.
    if (!row.accessToken && !row.refreshToken) return "REAUTH_REQUIRED";
    return row.status === "SYNC_ERROR" || row.lastSyncStatus === "failed" ? "ERROR" : "CONNECTED";
  }
  return "NOT_CONNECTED";
}
