import { createHmac, timingSafeEqual } from "crypto";
import { appUrl, OAuthError } from "@/lib/integrations/oauth";

/**
 * Slack, as a place Daythread posts short notices ("Jane wrote to you", "New booking").
 * A bot token from Slack's OAuth v2, one channel chosen at install. Slack answers 200 with
 * ok:false for most errors, so every call checks the body. Never a customer's message text.
 */
const SCOPES = ["chat:write", "channels:read", "channels:join"];
const clientId = () => process.env.SLACK_CLIENT_ID;
const clientSecret = () => process.env.SLACK_CLIENT_SECRET;
const signingSecret = () => process.env.SLACK_SIGNING_SECRET?.trim() || null;
export const slackRedirectUri = () => `${appUrl()}/api/auth/slack/callback`;
export const slackEventsUrl = () => `${appUrl()}/api/webhooks/slack/events`;

export function slackConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

/** Events (an uninstall, a revoked token) need the app's signing secret; posting does not. */
export function slackEventsConfigured(): boolean {
  return Boolean(signingSecret());
}

export const SLACK_SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Slack signs `v0:${timestamp}:${raw body}` with the app's signing secret (HMAC-SHA256)
 * and sends it as `X-Slack-Signature: v0=<hex>` beside `X-Slack-Request-Timestamp`. The
 * body must be the exact bytes received. A missing header, a stale timestamp, a malformed
 * signature and a wrong one are all simply false — the route answers each the same way.
 */
export function verifySlackSignature(rawBody: string, signatureHeader: string | null, timestampHeader: string | null, opts: { secret?: string | null; now?: number; toleranceSeconds?: number } = {}): boolean {
  const secret = opts.secret === undefined ? signingSecret() : opts.secret;
  if (!secret || !signatureHeader || !timestampHeader || !/^\d+$/.test(timestampHeader)) return false;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(now - Number(timestampHeader)) > (opts.toleranceSeconds ?? SLACK_SIGNATURE_TOLERANCE_SECONDS)) return false;
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestampHeader}:${rawBody}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function slackAuthUrl(state: string): string {
  const params = new URLSearchParams({ client_id: clientId()!, scope: SCOPES.join(","), redirect_uri: slackRedirectUri(), state });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

type SlackResponse<T> = ({ ok: true } & T) | { ok: false; error: string };

async function slackCall<T>(method: string, opts: { token?: string; form?: Record<string, string>; json?: unknown }): Promise<T> {
  const headers: Record<string, string> = {};
  let body: string | URLSearchParams | undefined;
  if (opts.json !== undefined) { headers["Content-Type"] = "application/json; charset=utf-8"; body = JSON.stringify(opts.json); }
  else if (opts.form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(opts.form); }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`https://slack.com/api/${method}`, { method: "POST", headers, body, signal: AbortSignal.timeout(15_000) });
  // Slack rate-limits with a real 429 and a Retry-After. That is a wait, not a broken
  // connection, and it must never be recorded as one.
  if (res.status === 429) throw new OAuthError(`Slack ${method} rate limited`, 429, "ratelimited");
  const data = (await res.json().catch(() => ({ ok: false, error: "invalid_json" }))) as SlackResponse<T>;
  if (!res.ok || !data.ok) {
    const error = data.ok ? undefined : data.error;
    const status = data.ok ? res.status : error === "ratelimited" ? 429 : /invalid_auth|token_revoked|account_inactive|not_authed/.test(error ?? "") ? 401 : 400;
    throw new OAuthError(`Slack ${method} failed: ${error ?? res.status}`, status, error);
  }
  return data as T;
}

export type SlackInstall = { accessToken: string; scope: string; botUserId: string; team: { id: string; name: string }; authedUserId: string | null };

export async function exchangeSlackCode(code: string): Promise<SlackInstall> {
  const r = await slackCall<{ access_token: string; scope: string; bot_user_id: string; team: { id: string; name: string }; authed_user?: { id?: string } }>("oauth.v2.access", { form: { client_id: clientId()!, client_secret: clientSecret()!, code, redirect_uri: slackRedirectUri() } });
  return { accessToken: r.access_token, scope: r.scope, botUserId: r.bot_user_id, team: r.team, authedUserId: r.authed_user?.id ?? null };
}

export async function revokeSlackToken(token: string): Promise<void> {
  try { await slackCall("auth.revoke", { token }); } catch { /* best effort */ }
}

export type SlackChannel = { id: string; name: string; isMember: boolean; isPrivate: boolean };

export async function listSlackChannels(token: string): Promise<SlackChannel[]> {
  const out: SlackChannel[] = [];
  let cursor = "";
  for (let i = 0; i < 5; i++) {
    const r = await slackCall<{ channels: Array<{ id: string; name: string; is_member?: boolean; is_private?: boolean; is_archived?: boolean }>; response_metadata?: { next_cursor?: string } }>("conversations.list", { token, form: { types: "public_channel", exclude_archived: "true", limit: "200", ...(cursor ? { cursor } : {}) } });
    for (const c of r.channels ?? []) if (!c.is_archived) out.push({ id: c.id, name: c.name, isMember: Boolean(c.is_member), isPrivate: Boolean(c.is_private) });
    cursor = r.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function joinSlackChannel(token: string, channelId: string): Promise<void> {
  await slackCall("conversations.join", { token, form: { channel: channelId } });
}

export async function postSlackMessage(token: string, channelId: string, text: string, link?: string | null): Promise<{ ts: string }> {
  const r = await slackCall<{ ts: string }>("chat.postMessage", { token, json: { channel: channelId, text: link ? `${text} <${link}|Open in Daythread>` : text, unfurl_links: false, unfurl_media: false } });
  return { ts: r.ts };
}

export async function slackAuthTest(token: string): Promise<{ teamId: string; team: string }> {
  const r = await slackCall<{ team_id: string; team: string }>("auth.test", { token });
  return { teamId: r.team_id, team: r.team };
}


// ── Events API ─────────────────────────────────────────────────────────────

/** What Slack posts to the events URL. Only the shapes Daythread acts on are typed. */
export type SlackEventEnvelope =
  | { type: "url_verification"; challenge?: string }
  | { type: "event_callback"; event_id?: string; team_id?: string; event?: { type?: string; tokens?: { bot?: string[]; oauth?: string[] } } }
  | { type?: string };

export type SlackEvent = { eventId: string; teamId: string; kind: "app_uninstalled" | "tokens_revoked" | "other"; type: string };

/**
 * The one event kind that is about the installation itself. Everything else Slack might be
 * configured to send is acknowledged and ignored — Daythread reads nothing from Slack.
 */
export function parseSlackEvent(envelope: SlackEventEnvelope): SlackEvent | null {
  if (envelope.type !== "event_callback") return null;
  const e = envelope as Extract<SlackEventEnvelope, { type: "event_callback" }>;
  if (!e.event_id || !e.team_id || !e.event?.type) return null;
  const type = e.event.type;
  return { eventId: e.event_id, teamId: e.team_id, type, kind: type === "app_uninstalled" ? "app_uninstalled" : type === "tokens_revoked" ? "tokens_revoked" : "other" };
}
