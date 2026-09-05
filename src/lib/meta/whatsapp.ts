import { GRAPH, graphFetch } from "./common";

/**
 * WhatsApp Business Platform (Cloud API) through Meta's Embedded Signup: Facebook Login for
 * Business with a configuration id, which onboards the business's WhatsApp Business
 * Account (WABA) and phone number and returns a code we exchange server-side for a
 * business token. The WABA and phone number are discovered from the token's granular
 * scopes, the app is subscribed to the WABA's webhooks, and messages flow through the
 * Cloud API with real status callbacks (sent / delivered / read / failed).
 *
 * Policy: free-form text is only allowed inside the 24-hour customer service window
 * after the customer's last message; outside it Meta rejects the send (131047) and an
 * approved template is required. Daythread refuses those sends honestly instead of
 * marking them sent.
 */
const AUTH_URL = "https://www.facebook.com/v21.0/dialog/oauth";
export const WA_SCOPES = ["whatsapp_business_management", "whatsapp_business_messaging", "business_management"];

export function whatsappConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.WHATSAPP_CONFIG_ID);
}
export function whatsappRedirectUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/whatsapp/callback`;
}
export function whatsappAuthUrl(state: string): string {
  const params = new URLSearchParams({ client_id: process.env.META_APP_ID!, redirect_uri: whatsappRedirectUri(), response_type: "code", config_id: process.env.WHATSAPP_CONFIG_ID!, state, override_default_response_type: "true", scope: WA_SCOPES.join(",") });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeWhatsAppCode(code: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
  const r = await graphFetch<{ access_token: string; expires_in?: number }>(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, redirect_uri: whatsappRedirectUri(), code })}`);
  return { accessToken: r.access_token, expiresAt: r.expires_in ? new Date(Date.now() + r.expires_in * 1000) : null };
}

/** WABA ids the token was granted for (Embedded Signup puts them in granular scopes). */
export async function discoverWabas(accessToken: string): Promise<string[]> {
  const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  const r = await graphFetch<{ data: { granular_scopes?: Array<{ scope: string; target_ids?: string[] }> } }>(`${GRAPH}/debug_token?${new URLSearchParams({ input_token: accessToken, access_token: appToken })}`);
  const ids = new Set<string>();
  for (const g of r.data.granular_scopes ?? []) if (g.scope === "whatsapp_business_management" || g.scope === "whatsapp_business_messaging") for (const id of g.target_ids ?? []) ids.add(id);
  return [...ids];
}

export type WaPhone = { id: string; display_phone_number: string; verified_name: string; quality_rating?: string; code_verification_status?: string };
export async function listPhoneNumbers(accessToken: string, wabaId: string): Promise<WaPhone[]> {
  const r = await graphFetch<{ data: WaPhone[] }>(`${GRAPH}/${wabaId}/phone_numbers?${new URLSearchParams({ fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status", access_token: accessToken })}`);
  return r.data ?? [];
}

export async function subscribeWabaWebhooks(accessToken: string, wabaId: string): Promise<void> {
  await graphFetch(`${GRAPH}/${wabaId}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
}

/** Registers the phone number for Cloud API messaging (idempotent; a number already
 * registered returns success). Meta requires a 6-digit PIN for two-step verification. */
export async function registerPhoneNumber(accessToken: string, phoneNumberId: string, pin: string): Promise<void> {
  await graphFetch(`${GRAPH}/${phoneNumberId}/register`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", pin }) });
}

export async function sendWhatsAppText(accessToken: string, phoneNumberId: string, to: string, text: string): Promise<{ messageId: string }> {
  const r = await graphFetch<{ messages: Array<{ id: string }> }>(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: to.replace(/[^\d]/g, ""), type: "text", text: { preview_url: false, body: text } }),
  });
  return { messageId: r.messages[0].id };
}

export const WA_WINDOW_MS = 24 * 3600 * 1000;
/** Free-form sends are only allowed within 24h of the customer's last message. */
export function withinServiceWindow(lastInboundAt: Date | null, now = new Date()): boolean {
  return Boolean(lastInboundAt && now.getTime() - lastInboundAt.getTime() < WA_WINDOW_MS);
}
