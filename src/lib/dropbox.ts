import type { Integration } from "@prisma/client";
import { tokenRequest, validAccessToken, bearerJson, appUrl, OAuthError, type OAuthTokens } from "@/lib/integrations/oauth";

/**
 * Dropbox with an App-folder app: Daythread sees only its own folder in the person's
 * Dropbox. OAuth 2 with PKCE and offline refresh tokens (Dropbox's short-lived tokens
 * expire in four hours). Folder references only, never file contents.
 */
const SCOPES = ["account_info.read", "files.metadata.read", "files.content.write", "sharing.write", "sharing.read"];
const API = "https://api.dropboxapi.com/2";
const appKey = () => process.env.DROPBOX_APP_KEY;
const appSecret = () => process.env.DROPBOX_APP_SECRET;
export const dropboxRedirectUri = () => `${appUrl()}/api/auth/dropbox/callback`;

export function dropboxConfigured(): boolean {
  return Boolean(appKey() && appSecret());
}

export function dropboxAuthUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({ client_id: appKey()!, response_type: "code", redirect_uri: dropboxRedirectUri(), state, token_access_type: "offline", code_challenge: codeChallenge, code_challenge_method: "S256", scope: SCOPES.join(" ") });
  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
}

export function exchangeDropboxCode(code: string, codeVerifier: string): Promise<OAuthTokens> {
  return tokenRequest("https://api.dropboxapi.com/oauth2/token", { code, grant_type: "authorization_code", redirect_uri: dropboxRedirectUri(), code_verifier: codeVerifier, client_id: appKey()!, client_secret: appSecret()! });
}

export function refreshDropboxToken(refreshToken: string): Promise<OAuthTokens> {
  return tokenRequest("https://api.dropboxapi.com/oauth2/token", { grant_type: "refresh_token", refresh_token: refreshToken, client_id: appKey()!, client_secret: appSecret()! });
}

export async function revokeDropboxToken(accessToken: string): Promise<void> {
  try { await fetch(`${API}/auth/token/revoke`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }); } catch { /* best effort */ }
}

export const dropboxToken = (integration: Integration) => validAccessToken(integration, refreshDropboxToken, { label: "Dropbox" });

/**
 * Dropbox RPC. Endpoints that take arguments want JSON; endpoints that take none reject a
 * JSON content type outright ("Bad HTTP Content-Type header"), so those are sent with no
 * body and no content type at all. Getting this wrong fails the very first call after
 * authorization — identifying the account — and so fails the whole connection.
 */
function rpc<T>(accessToken: string, path: string, body?: unknown): Promise<T> {
  if (body === undefined) return bearerJson<T>(`${API}/${path}`, accessToken, { method: "POST" });
  return bearerJson<T>(`${API}/${path}`, accessToken, { method: "POST", body, headers: { "Content-Type": "application/json" } });
}

export type DropboxAccount = { accountId: string; email: string; displayName: string };

export async function dropboxCurrentAccount(accessToken: string): Promise<DropboxAccount> {
  const a = await rpc<{ account_id: string; email: string; name?: { display_name?: string } }>(accessToken, "users/get_current_account", undefined);
  return { accountId: a.account_id, email: a.email, displayName: a.name?.display_name ?? a.email };
}

export type DropboxEntry = { id: string; name: string; path: string; kind: "file" | "folder"; modifiedAt: string | null; size: number | null };

/** Create a folder (or return the one already there). */
export async function ensureDropboxFolder(accessToken: string, path: string): Promise<{ id: string; path: string; name: string }> {
  try {
    const r = await rpc<{ metadata: { id: string; path_display: string; name: string } }>(accessToken, "files/create_folder_v2", { path, autorename: false });
    return { id: r.metadata.id, path: r.metadata.path_display, name: r.metadata.name };
  } catch (err) {
    if (err instanceof OAuthError && err.status === 409) {
      const m = await rpc<{ id: string; path_display: string; name: string }>(accessToken, "files/get_metadata", { path });
      return { id: m.id, path: m.path_display, name: m.name };
    }
    throw err;
  }
}

export async function listDropboxFolder(accessToken: string, path: string): Promise<DropboxEntry[]> {
  const r = await rpc<{ entries: Array<{ ".tag": "file" | "folder" | "deleted"; id: string; name: string; path_display: string; server_modified?: string; size?: number }> }>(accessToken, "files/list_folder", { path, limit: 100 });
  return (r.entries ?? []).filter((e) => e[".tag"] !== "deleted").map((e) => ({ id: e.id, name: e.name, path: e.path_display, kind: e[".tag"] === "folder" ? "folder" : "file", modifiedAt: e.server_modified ?? null, size: e.size ?? null }));
}

/** A link the owner can open in Dropbox. Shared links are the documented way to get one for an app-folder path. */
export async function dropboxFolderLink(accessToken: string, path: string): Promise<string | null> {
  // No requested_visibility: Dropbox then applies the most restrictive setting the account
  // allows. Asking for "team_only" is refused outright on a personal account, which left
  // every folder without a link.
  try {
    const r = await rpc<{ url: string }>(accessToken, "sharing/create_shared_link_with_settings", { path });
    return r.url;
  } catch (err) {
    // 409 covers "a link already exists" as well as a settings refusal; either way the
    // existing link is the answer, and finding it needs sharing.read.
    if (err instanceof OAuthError && err.status === 409) {
      const r = await rpc<{ links: Array<{ url: string }> }>(accessToken, "sharing/list_shared_links", { path, direct_only: true }).catch(() => ({ links: [] }));
      return r.links?.[0]?.url ?? null;
    }
    return null;
  }
}
