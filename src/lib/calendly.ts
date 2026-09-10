import { createHmac, timingSafeEqual } from "crypto";
import type { Integration } from "@prisma/client";
import { tokenRequest, validAccessToken, bearerJson, appUrl, OAuthError, type OAuthTokens } from "@/lib/integrations/oauth";
import { requiredSecret } from "@/lib/env";

/**
 * Calendly API v2. Meetings booked through Calendly are read (scheduled events and their
 * invitees) and turned into Daythread bookings; nothing is written to Calendly except the
 * webhook subscription. Webhooks are a paid Calendly feature: when Calendly refuses one,
 * the connection still works by polling on open and daily, and the card says so.
 */
const AUTH = "https://auth.calendly.com/oauth";
const API = "https://api.calendly.com";
const clientId = () => process.env.CALENDLY_CLIENT_ID;
const clientSecret = () => process.env.CALENDLY_CLIENT_SECRET;
export const calendlyRedirectUri = () => `${appUrl()}/api/auth/calendly/callback`;
export const calendlyWebhookUrl = () => `${appUrl()}/api/webhooks/calendly`;

export function calendlyConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

export function calendlyAuthUrl(state: string): string {
  const params = new URLSearchParams({ client_id: clientId()!, response_type: "code", redirect_uri: calendlyRedirectUri(), state });
  return `${AUTH}/authorize?${params.toString()}`;
}

export function exchangeCalendlyCode(code: string): Promise<OAuthTokens> {
  return tokenRequest(`${AUTH}/token`, { grant_type: "authorization_code", client_id: clientId()!, client_secret: clientSecret()!, code, redirect_uri: calendlyRedirectUri() });
}

export function refreshCalendlyToken(refreshToken: string): Promise<OAuthTokens> {
  return tokenRequest(`${AUTH}/token`, { grant_type: "refresh_token", client_id: clientId()!, client_secret: clientSecret()!, refresh_token: refreshToken });
}

export async function revokeCalendlyToken(token: string): Promise<void> {
  try { await fetch(`${AUTH}/revoke`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId()!, client_secret: clientSecret()!, token }) }); } catch { /* best effort */ }
}

export const calendlyToken = (integration: Integration) => validAccessToken(integration, refreshCalendlyToken, { label: "Calendly" });

export type CalendlyUser = { uri: string; name: string; email: string; schedulingUrl: string; organization: string; timezone: string | null };

export async function calendlyMe(accessToken: string): Promise<CalendlyUser> {
  const r = await bearerJson<{ resource: { uri: string; name: string; email: string; scheduling_url: string; current_organization: string; timezone?: string } }>(`${API}/users/me`, accessToken);
  return { uri: r.resource.uri, name: r.resource.name, email: r.resource.email, schedulingUrl: r.resource.scheduling_url, organization: r.resource.current_organization, timezone: r.resource.timezone ?? null };
}

export type CalendlyEvent = { uri: string; name: string; status: "active" | "canceled"; startTime: string; endTime: string; location: string | null; eventType: string | null; updatedAt: string | null };
export type CalendlyInvitee = { uri: string; name: string; email: string; status: "active" | "canceled"; timezone: string | null; phone: string | null; answers: Array<{ question: string; answer: string }> };

type Raw = { uri: string; name?: string; status: "active" | "canceled"; start_time: string; end_time: string; location?: { type?: string; location?: string | null; join_url?: string | null } | null; event_type?: string; updated_at?: string };
const toEvent = (e: Raw): CalendlyEvent => ({ uri: e.uri, name: e.name ?? "Calendly meeting", status: e.status, startTime: e.start_time, endTime: e.end_time, location: e.location?.location ?? e.location?.join_url ?? (e.location?.type ? e.location.type.replace(/_/g, " ") : null), eventType: e.event_type ?? null, updatedAt: e.updated_at ?? null });

/** Scheduled events for the user from `minStart` on, active and cancelled, newest change last. */
export async function listCalendlyEvents(accessToken: string, userUri: string, opts: { minStart: Date; maxStart?: Date; max?: number }): Promise<CalendlyEvent[]> {
  const out: CalendlyEvent[] = [];
  for (const status of ["active", "canceled"] as const) {
    let token: string | null = null;
    for (let i = 0; i < 10; i++) {
      const params = new URLSearchParams({ user: userUri, status, min_start_time: opts.minStart.toISOString(), sort: "start_time:asc", count: "100" });
      if (opts.maxStart) params.set("max_start_time", opts.maxStart.toISOString());
      if (token) params.set("page_token", token);
      const r = await bearerJson<{ collection: Raw[]; pagination?: { next_page_token?: string | null } }>(`${API}/scheduled_events?${params.toString()}`, accessToken);
      out.push(...(r.collection ?? []).map(toEvent));
      token = r.pagination?.next_page_token ?? null;
      if (!token || out.length >= (opts.max ?? 500)) break;
    }
  }
  return out;
}

export const calendlyEventUuid = (uri: string) => uri.split("/").filter(Boolean).pop() ?? uri;

export async function listCalendlyInvitees(accessToken: string, eventUri: string): Promise<CalendlyInvitee[]> {
  const r = await bearerJson<{ collection: Array<{ uri: string; name: string; email: string; status: "active" | "canceled"; timezone?: string; text_reminder_number?: string | null; questions_and_answers?: Array<{ question: string; answer: string }> }> }>(`${API}/scheduled_events/${encodeURIComponent(calendlyEventUuid(eventUri))}/invitees?count=100`, accessToken);
  return (r.collection ?? []).map((i) => ({ uri: i.uri, name: i.name, email: i.email, status: i.status, timezone: i.timezone ?? null, phone: i.text_reminder_number ?? null, answers: i.questions_and_answers ?? [] }));
}

/**
 * The key Calendly signs this connection's webhooks with. Derived from the deployment's
 * secret and the row, so it is never stored anywhere and a different deployment or row
 * can never verify (or forge) it.
 */
export function calendlySigningKey(integrationId: string): string {
  return createHmac("sha256", process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY || requiredSecret("JWT_SECRET")).update(`calendly-webhook:${integrationId}`).digest("hex");
}

export type WebhookOutcome = { ok: true; uri: string } | { ok: false; reason: "plan" | "exists" | "error"; detail?: string };

export async function createCalendlyWebhook(accessToken: string, params: { userUri: string; organization: string; signingKey: string }): Promise<WebhookOutcome> {
  try {
    const r = await bearerJson<{ resource: { uri: string } }>(`${API}/webhook_subscriptions`, accessToken, { method: "POST", body: { url: calendlyWebhookUrl(), events: ["invitee.created", "invitee.canceled"], organization: params.organization, user: params.userUri, scope: "user", signing_key: params.signingKey } });
    return { ok: true, uri: r.resource.uri };
  } catch (err) {
    if (err instanceof OAuthError) {
      if (err.status === 402 || err.status === 403) return { ok: false, reason: "plan", detail: err.message };
      if (err.status === 409) return { ok: false, reason: "exists", detail: err.message };
      return { ok: false, reason: "error", detail: err.message };
    }
    throw err;
  }
}

export async function deleteCalendlyWebhook(accessToken: string, webhookUri: string): Promise<void> {
  try { await bearerJson(`${API}/webhook_subscriptions/${encodeURIComponent(calendlyEventUuid(webhookUri))}`, accessToken, { method: "DELETE" }); } catch { /* best effort */ }
}

/** `Calendly-Webhook-Signature: t=<unix>,v1=<hex>`; signed content is `${t}.${body}`. */
export function verifyCalendlySignature(rawBody: string, header: string | null, signingKey: string, opts: { toleranceSeconds?: number; now?: number } = {}): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || !/^\d+$/.test(t)) return false;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(now - Number(t)) > (opts.toleranceSeconds ?? 300)) return false;
  const expected = createHmac("sha256", signingKey).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type CalendlyWebhookPayload = {
  event: "invitee.created" | "invitee.canceled" | string;
  created_at?: string;
  created_by?: string;
  payload?: { uri?: string; name?: string; email?: string; status?: "active" | "canceled"; timezone?: string; text_reminder_number?: string | null; questions_and_answers?: Array<{ question: string; answer: string }>; scheduled_event?: Raw & { uri: string }; cancellation?: { reason?: string } };
};

export const rawToEvent = toEvent;
