import { IG_GRAPH, graphFetch } from "./common";

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

export function instagramConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
}
export function instagramRedirectUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/instagram/callback`;
}
export function instagramAuthUrl(state: string): string {
  const params = new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID!, redirect_uri: instagramRedirectUri(), response_type: "code", scope: IG_SCOPES.join(","), state, enable_fb_login: "0", force_authentication: "1" });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeInstagramCode(code: string): Promise<{ accessToken: string; userId: string; expiresAt: Date }> {
  const short = await graphFetch<{ access_token: string; user_id: number | string }>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID!, client_secret: process.env.INSTAGRAM_APP_SECRET!, grant_type: "authorization_code", redirect_uri: instagramRedirectUri(), code }),
  });
  const long = await graphFetch<{ access_token: string; expires_in: number }>(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: process.env.INSTAGRAM_APP_SECRET!, access_token: short.access_token })}`);
  return { accessToken: long.access_token, userId: String(short.user_id), expiresAt: new Date(Date.now() + long.expires_in * 1000) };
}

export async function refreshInstagramToken(token: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const r = await graphFetch<{ access_token: string; expires_in: number }>(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })}`);
  return { accessToken: r.access_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
}

export type IgProfile = { id: string; username: string; name?: string; account_type?: string };
export async function instagramProfile(token: string): Promise<IgProfile> {
  return graphFetch<IgProfile>(`${IG_GRAPH}/me?${new URLSearchParams({ fields: "id,username,name,account_type", access_token: token })}`);
}

/** Subscribes the connected account to the app's webhook fields (messages). */
export async function subscribeInstagramWebhooks(token: string, igUserId: string): Promise<void> {
  await graphFetch(`${IG_GRAPH}/${igUserId}/subscribed_apps?${new URLSearchParams({ subscribed_fields: "messages", access_token: token })}`, { method: "POST" });
}

export async function sendInstagramMessage(token: string, igUserId: string, recipientId: string, text: string): Promise<{ messageId: string }> {
  const r = await graphFetch<{ recipient_id: string; message_id: string }>(`${IG_GRAPH}/${igUserId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  return { messageId: r.message_id };
}

/** Recent conversations for the first sync after connecting. */
export async function listInstagramConversations(token: string, limit = 20): Promise<Array<{ id: string; participants: Array<{ id: string; username?: string }>; messages: Array<{ id: string; from: { id: string; username?: string }; message?: string; created_time: string; attachments?: { data: Array<{ id?: string; image_data?: unknown; video_data?: unknown }> } }> }>> {
  const r = await graphFetch<{ data: Array<{ id: string; participants: { data: Array<{ id: string; username?: string }> }; messages: { data: Array<{ id: string; from: { id: string; username?: string }; message?: string; created_time: string; attachments?: { data: Array<{ id?: string }> } }> } }> }>(
    `${IG_GRAPH}/me/conversations?${new URLSearchParams({ platform: "instagram", fields: "id,participants,messages.limit(10){id,from,message,created_time,attachments}", limit: String(limit), access_token: token })}`
  );
  return (r.data ?? []).map((c) => ({ id: c.id, participants: c.participants?.data ?? [], messages: c.messages?.data ?? [] }));
}

export async function instagramUserProfile(token: string, igsid: string): Promise<{ username?: string; name?: string }> {
  try {
    return await graphFetch<{ username?: string; name?: string }>(`${IG_GRAPH}/${igsid}?${new URLSearchParams({ fields: "username,name", access_token: token })}`);
  } catch {
    return {};
  }
}
