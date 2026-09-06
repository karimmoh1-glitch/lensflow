import { GRAPH, graphFetch, MetaApiError } from "./common";
import { appBaseUrl, metaProductReady } from "./config";

/**
 * WhatsApp Business Platform (Cloud API) through Meta's Embedded Signup: Facebook Login for
 * Business with a configuration id, which onboards the business's WhatsApp Business
 * Account (WABA) and phone number and returns a code we exchange server-side for a
 * business token. The WABA and phone numbers are discovered from the token's granular
 * scopes — never from anything the browser sends — the app is subscribed to the WABA's
 * webhooks, and messages flow through the Cloud API with real status callbacks
 * (sent / delivered / read / failed).
 *
 * Policy: free-form text is only allowed inside the 24-hour customer service window after
 * the customer's last message; outside it Meta rejects the send (131047) and an approved
 * template is required. Daythread refuses those sends up front and says so, instead of
 * marking them sent.
 */
const AUTH_URL = "https://www.facebook.com/v21.0/dialog/oauth";
export const WA_SCOPES = ["whatsapp_business_management", "whatsapp_business_messaging", "business_management"];

export function whatsappConfigured(): boolean {
  return metaProductReady("whatsapp");
}
export function whatsappRedirectUri(): string {
  return `${appBaseUrl()}/api/auth/whatsapp/callback`;
}
export function whatsappAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: whatsappRedirectUri(),
    response_type: "code",
    config_id: process.env.WHATSAPP_CONFIG_ID!,
    state,
    override_default_response_type: "true",
    scope: WA_SCOPES.join(","),
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeWhatsAppCode(code: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
  // POSTed as a form body rather than a query string: the app secret never belongs in a URL,
  // where it can end up in a proxy log or an echoed error.
  const r = await graphFetch<{ access_token: string; expires_in?: number }>(`${GRAPH}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, redirect_uri: whatsappRedirectUri(), code }),
  });
  if (!r?.access_token) throw new MetaApiError(502, null, "Meta returned no access token for that authorization.");
  const seconds = Number(r.expires_in);
  return { accessToken: r.access_token, expiresAt: Number.isFinite(seconds) && seconds > 0 ? new Date(Date.now() + seconds * 1000) : null };
}

/**
 * The WABA ids this token was actually granted for, read from Meta's own debug_token with
 * an app token. This is the ownership check: a browser can post any WABA id it likes, and
 * only ids that appear here are ever stored or used.
 */
export async function discoverWabas(accessToken: string): Promise<string[]> {
  // The app token goes in the Authorization header, not the query string.
  const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  const r = await graphFetch<{ data?: { is_valid?: boolean; granular_scopes?: Array<{ scope: string; target_ids?: string[] }> } }>(
    `${GRAPH}/debug_token?${new URLSearchParams({ input_token: accessToken })}`,
    { headers: { Authorization: `Bearer ${appToken}` } }
  );
  if (r.data?.is_valid === false) throw new MetaApiError(401, 190, "Meta reported the new token as invalid.");
  const ids = new Set<string>();
  for (const g of r.data?.granular_scopes ?? []) {
    if (g.scope === "whatsapp_business_management" || g.scope === "whatsapp_business_messaging") for (const id of g.target_ids ?? []) ids.add(id);
  }
  return [...ids];
}

/** True only when this token is genuinely granted for this WABA — used before trusting any
 * id that came back through the browser. */
export async function tokenOwnsWaba(accessToken: string, wabaId: string): Promise<boolean> {
  return (await discoverWabas(accessToken)).includes(wabaId);
}

export type WaPhone = {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
  code_verification_status?: string;
  platform_type?: string;
  throughput?: { level?: string };
};

export async function listPhoneNumbers(accessToken: string, wabaId: string): Promise<WaPhone[]> {
  const r = await graphFetch<{ data?: WaPhone[] }>(
    `${GRAPH}/${wabaId}/phone_numbers?${new URLSearchParams({ fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput", access_token: accessToken })}`
  );
  return (r.data ?? []).filter((p) => p && typeof p.id === "string");
}

export type WabaDetail = { id: string; name?: string; currency?: string; timezone_id?: string; account_review_status?: string; business_verification_status?: string };
export async function wabaDetail(accessToken: string, wabaId: string): Promise<WabaDetail | null> {
  try {
    return await graphFetch<WabaDetail>(`${GRAPH}/${wabaId}?${new URLSearchParams({ fields: "id,name,currency,timezone_id,account_review_status", access_token: accessToken })}`);
  } catch {
    return null;
  }
}

export async function subscribeWabaWebhooks(accessToken: string, wabaId: string): Promise<void> {
  await graphFetch(`${GRAPH}/${wabaId}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
}

/** Stops Meta delivering this WABA's events to Daythread — used on disconnect. */
export async function unsubscribeWabaWebhooks(accessToken: string, wabaId: string): Promise<void> {
  await graphFetch(`${GRAPH}/${wabaId}/subscribed_apps`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
}

/** Registers the phone number for Cloud API messaging (idempotent; a number already
 * registered returns success). Meta requires a 6-digit PIN for two-step verification. */
export async function registerPhoneNumber(accessToken: string, phoneNumberId: string, pin: string): Promise<void> {
  await graphFetch(`${GRAPH}/${phoneNumberId}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
}

export async function sendWhatsAppText(accessToken: string, phoneNumberId: string, to: string, text: string): Promise<{ messageId: string }> {
  const digits = to.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) throw new MetaApiError(400, null, "That isn't a phone number WhatsApp can deliver to.");
  const r = await graphFetch<{ messages?: Array<{ id: string }> }>(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: digits, type: "text", text: { preview_url: false, body: text } }),
  });
  const id = r.messages?.[0]?.id;
  if (!id) throw new MetaApiError(502, null, "WhatsApp accepted the request but returned no message id.");
  return { messageId: id };
}

// ── Templates ──────────────────────────────────────────────────────────────
// Outside the 24-hour window, only an approved template may be sent. Daythread does not
// create, submit or send templates yet: doing so requires templates approved on the
// business's own WABA, which cannot exist before a real WABA is connected. The API surface
// below is the seam that support will plug into — `listWhatsAppTemplates` is read-only and
// real, `sendWhatsAppTemplate` is real but is not wired to the composer, and
// `templatesEnabled()` reports honestly that the feature is off.

export type WaTemplate = { id: string; name: string; language: string; status: string; category: string };

export function templatesEnabled(): boolean {
  return false;
}

/** Approved templates on a WABA. Read-only; used by the Manage sheet to say what exists. */
export async function listWhatsAppTemplates(accessToken: string, wabaId: string): Promise<WaTemplate[]> {
  const r = await graphFetch<{ data?: Array<{ id: string; name: string; language: string; status: string; category: string }> }>(
    `${GRAPH}/${wabaId}/message_templates?${new URLSearchParams({ fields: "id,name,language,status,category", limit: "50", access_token: accessToken })}`
  );
  return r.data ?? [];
}

/** Sends an approved template. Real Cloud API call, deliberately not reachable from the
 * composer until template management exists — see docs/integrations/meta.md. */
export async function sendWhatsAppTemplate(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  template: { name: string; language: string; bodyParams?: string[] }
): Promise<{ messageId: string }> {
  const digits = to.replace(/\D/g, "");
  const components = template.bodyParams?.length ? [{ type: "body", parameters: template.bodyParams.map((t) => ({ type: "text", text: t })) }] : undefined;
  const r = await graphFetch<{ messages?: Array<{ id: string }> }>(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: digits, type: "template", template: { name: template.name, language: { code: template.language }, ...(components ? { components } : {}) } }),
  });
  const id = r.messages?.[0]?.id;
  if (!id) throw new MetaApiError(502, null, "WhatsApp accepted the template but returned no message id.");
  return { messageId: id };
}

// ── The 24-hour customer service window ────────────────────────────────────

export const WA_WINDOW_MS = 24 * 3600 * 1000;

/** Free-form sends are only allowed within 24h of the customer's last message. */
export function withinServiceWindow(lastInboundAt: Date | null, now = new Date()): boolean {
  if (!lastInboundAt) return false;
  const elapsed = now.getTime() - lastInboundAt.getTime();
  // A timestamp in the future is a clock problem, not an open window.
  return elapsed >= 0 && elapsed < WA_WINDOW_MS;
}

/** How much of the window is left, for the composer's own honesty. */
export function serviceWindowRemainingMs(lastInboundAt: Date | null, now = new Date()): number {
  if (!lastInboundAt) return 0;
  return Math.max(0, WA_WINDOW_MS - (now.getTime() - lastInboundAt.getTime()));
}

export const WA_WINDOW_CLOSED_MESSAGE =
  "Saved, not delivered — WhatsApp only allows a free-form reply within 24 hours of the customer's last message. An approved template is required after that, and templates aren't set up yet.";
