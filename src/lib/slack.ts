import { appUrl, OAuthError } from "@/lib/integrations/oauth";

/**
 * Slack, as a place Daythread posts short notices ("Jane wrote to you", "New booking").
 * A bot token from Slack's OAuth v2, one channel chosen at install. Slack answers 200 with
 * ok:false for most errors, so every call checks the body. Never a customer's message text.
 */
const SCOPES = ["chat:write", "channels:read", "channels:join"];
const clientId = () => process.env.SLACK_CLIENT_ID;
const clientSecret = () => process.env.SLACK_CLIENT_SECRET;
export const slackRedirectUri = () => `${appUrl()}/api/auth/slack/callback`;

export function slackConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
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
  const res = await fetch(`https://slack.com/api/${method}`, { method: "POST", headers, body });
  const data = (await res.json().catch(() => ({ ok: false, error: "invalid_json" }))) as SlackResponse<T>;
  if (!res.ok || !data.ok) throw new OAuthError(`Slack ${method} failed: ${data.ok ? res.status : data.error}`, data.ok ? res.status : /invalid_auth|token_revoked|account_inactive|not_authed/.test(data.error) ? 401 : 400, data.ok ? undefined : data.error);
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
