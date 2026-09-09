import { IG_GRAPH, graphFetch, MetaApiError } from "./common";
import { appBaseUrl, metaProductReady } from "./config";

/**
 * Instagram API with Instagram Login (Meta, 2024+): a professional account (Business or
 * Creator) authorizes Daythread directly — no Facebook Page required. Scopes:
 * instagram_business_basic (identity) and instagram_business_manage_messages (DMs).
 * Tokens: a short-lived token from the code exchange is swapped for a 60-day long-lived
 * token, which is refreshed before expiry (refreshable once it is at least 24h old).
 * Until Meta App Review grants advanced access, only the app's testers can complete this.
 */
const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"];
/** The account types Meta allows messaging for. A personal account cannot connect. */
const PROFESSIONAL = /^(BUSINESS|MEDIA_CREATOR|CREATOR)$/i;

export function instagramConfigured(): boolean {
  return metaProductReady("instagram");
}
export function instagramRedirectUri(): string {
  return `${appBaseUrl()}/api/auth/instagram/callback`;
}
export function isProfessionalAccount(accountType: string | undefined | null): boolean {
  // Meta has historically omitted account_type on some responses; an absent value is not
  // evidence of a personal account, and the messaging scope itself would have been refused.
  return !accountType || PROFESSIONAL.test(accountType);
}

export function instagramAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    redirect_uri: instagramRedirectUri(),
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state,
    enable_fb_login: "0",
    force_authentication: "1",
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeInstagramCode(code: string): Promise<{ accessToken: string; userId: string; expiresAt: Date }> {
  const short = await graphFetch<{ access_token: string; user_id: number | string }>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID!,
      client_secret: process.env.INSTAGRAM_APP_SECRET!,
      grant_type: "authorization_code",
      redirect_uri: instagramRedirectUri(),
      code,
    }),
  });
  if (!short.access_token || !short.user_id) throw new MetaApiError(502, null, "Instagram returned an incomplete token response.");
  const long = await graphFetch<{ access_token: string; expires_in: number }>(
    `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: process.env.INSTAGRAM_APP_SECRET!, access_token: short.access_token })}`
  );
  if (!long.access_token) throw new MetaApiError(502, null, "Instagram did not return a long-lived token.");
  const seconds = Number(long.expires_in);
  return { accessToken: long.access_token, userId: String(short.user_id), expiresAt: new Date(Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60 * 86400) * 1000) };
}

export async function refreshInstagramToken(token: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const r = await graphFetch<{ access_token: string; expires_in: number }>(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })}`);
  if (!r.access_token) throw new MetaApiError(502, null, "Instagram did not return a refreshed token.");
  const seconds = Number(r.expires_in);
  return { accessToken: r.access_token, expiresAt: new Date(Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60 * 86400) * 1000) };
}

export type IgProfile = { id: string; username: string; name?: string; account_type?: string };
export async function instagramProfile(token: string): Promise<IgProfile> {
  const p = await graphFetch<IgProfile>(`${IG_GRAPH}/me?${new URLSearchParams({ fields: "id,username,name,account_type", access_token: token })}`);
  if (!p?.id || !p?.username) throw new MetaApiError(502, null, "Instagram returned no account for this authorization.");
  return p;
}

/** What the token actually carries. Used to refuse a connection that is missing the
 * messaging permission instead of storing one that can only ever fail on send. */
export async function instagramGrantedScopes(token: string): Promise<string[] | null> {
  const appToken = `${process.env.INSTAGRAM_APP_ID}|${process.env.INSTAGRAM_APP_SECRET}`;
  try {
    // App token in the header, never in the URL.
    const r = await graphFetch<{ data?: { scopes?: string[]; is_valid?: boolean } }>(`https://graph.instagram.com/debug_token?${new URLSearchParams({ input_token: token })}`, {
      headers: { Authorization: `Bearer ${appToken}` },
    });
    const scopes = r.data?.scopes;
    return Array.isArray(scopes) ? scopes : null;
  } catch {
    // Meta does not guarantee debug_token on the Instagram host; an unavailable check is
    // not a failed check, so the caller treats null as "could not verify".
    return null;
  }
}

/** Subscribes the connected account to the app's webhook fields. */
export async function subscribeInstagramWebhooks(token: string, igUserId: string): Promise<void> {
  await graphFetch(`${IG_GRAPH}/${igUserId}/subscribed_apps?${new URLSearchParams({ subscribed_fields: "messages", access_token: token })}`, { method: "POST" });
}

/** What the account is subscribed to on this app; `messages` must be present for DMs to arrive. */
export async function listInstagramSubscriptions(token: string, igUserId: string): Promise<{ subscribed: boolean; fields: string[] }> {
  const r = await graphFetch<{ data?: Array<{ subscribed_fields?: string[] }> }>(`${IG_GRAPH}/${igUserId}/subscribed_apps?${new URLSearchParams({ access_token: token })}`);
  const fields = (r.data ?? []).flatMap((d) => d.subscribed_fields ?? []);
  return { subscribed: fields.includes("messages"), fields };
}

/** Stops Meta delivering this account's events to Daythread. Called on disconnect so a
 * disconnected account genuinely stops sending, rather than only being ignored here. */
export async function unsubscribeInstagramWebhooks(token: string, igUserId: string): Promise<void> {
  await graphFetch(`${IG_GRAPH}/${igUserId}/subscribed_apps?${new URLSearchParams({ access_token: token })}`, { method: "DELETE" });
}

export async function sendInstagramMessage(token: string, igUserId: string, recipientId: string, text: string): Promise<{ messageId: string }> {
  const r = await graphFetch<{ recipient_id: string; message_id: string }>(`${IG_GRAPH}/${igUserId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  if (!r?.message_id) throw new MetaApiError(502, null, "Instagram accepted the request but returned no message id.");
  return { messageId: r.message_id };
}

/** Recent conversations for the first sync after connecting. */
export async function listInstagramConversations(
  token: string,
  limit = 20
): Promise<Array<{ id: string; participants: Array<{ id: string; username?: string }>; messages: Array<{ id: string; from: { id: string; username?: string }; message?: string; created_time: string }> }>> {
  const r = await graphFetch<{
    data?: Array<{ id: string; participants?: { data?: Array<{ id: string; username?: string }> }; messages?: { data?: Array<{ id: string; from: { id: string; username?: string }; message?: string; created_time: string }> } }>;
  }>(`${IG_GRAPH}/me/conversations?${new URLSearchParams({ fields: "id,participants,messages.limit(10){id,from,message,created_time}", limit: String(Math.min(Math.max(limit, 1), 50)), access_token: token })}`);
  return (r.data ?? []).map((c) => ({ id: c.id, participants: c.participants?.data ?? [], messages: c.messages?.data ?? [] }));
}

export async function instagramUserProfile(token: string, igsid: string): Promise<{ username?: string; name?: string }> {
  try {
    return await graphFetch<{ username?: string; name?: string }>(`${IG_GRAPH}/${igsid}?${new URLSearchParams({ fields: "username,name", access_token: token })}`);
  } catch {
    // Not every sender exposes a profile to the business; an unknown name is fine, a
    // failed webhook is not.
    return {};
  }
}
