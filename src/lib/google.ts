import { SignJWT, jwtVerify } from "jose";
import { requiredSecret } from "@/lib/env";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { normalizeEmailContent } from "./emailNormalize";
import type { Integration } from "@prisma/client";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/userinfo.email"];
const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/userinfo.email"];
const SIGNIN_SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"];
// drive.file is non-sensitive: only what Daythread itself creates is visible to it.
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/userinfo.email"];
export const SCOPES_BY_PURPOSE = { gmail: GMAIL_SCOPES.join(" "), calendar: CALENDAR_SCOPES.join(" "), signin: SIGNIN_SCOPES.join(" "), drive: DRIVE_SCOPES.join(" ") } as const;
export type GooglePurpose = keyof typeof SCOPES_BY_PURPOSE;
const SCOPES = SCOPES_BY_PURPOSE.gmail;
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

function clientId() {
  return process.env.GOOGLE_CLIENT_ID;
}
function clientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET;
}
function redirectUri() {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`;
}

export function googleOAuthConfigured() {
  return Boolean(clientId() && clientSecret());
}

// The OAuth `state` param round-trips through Google's servers and back to our public
// callback route, so it has to be self-verifying (not a DB lookup keyed by something
// guessable) — a short-lived signed token is the standard way to carry the initiating
// business's id through the redirect without an extra table.
const stateSecret = () => new TextEncoder().encode(requiredSecret("JWT_SECRET"));

const NONCE_COOKIE = "google_oauth_nonce";

/** Being signed only proves the state wasn't tampered with — it doesn't prove the browser
 * completing the callback is the one that started the flow. Without binding to something
 * only that browser has, anyone can mint a valid consent URL for their own business and
 * get a victim to click it, linking the victim's real Gmail into the attacker's business.
 * A random nonce set in an httpOnly cookie at connect-time, and required to match here at
 * callback-time, closes that: an attacker's cookie never reaches the victim's browser. */
export async function signGoogleState(businessId: string) {
  const nonce = randomBytes(24).toString("hex");
  const store = await cookies();
  store.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return new SignJWT({ businessId, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(stateSecret());
}

export async function verifyGoogleState(state: string): Promise<{ businessId: string } | null> {
  try {
    const { payload } = await jwtVerify(state, stateSecret());
    if (typeof payload.businessId !== "string" || typeof payload.nonce !== "string") return null;

    const store = await cookies();
    const cookieNonce = store.get(NONCE_COOKIE)?.value;
    store.delete(NONCE_COOKIE);
    if (!cookieNonce || cookieNonce !== payload.nonce) return null;

    return { businessId: payload.businessId };
  } catch {
    return null;
  }
}

export async function getGoogleAuthUrl(state: string, purpose: GooglePurpose = "gmail") {
  // Sign-in asks for identity only, needs no refresh token, and shows the account chooser
  // rather than a consent screen; channel connections ask for their scopes with offline access.
  const params = new URLSearchParams(
    purpose === "signin"
      ? { client_id: clientId()!, redirect_uri: redirectUri(), response_type: "code", scope: SCOPES_BY_PURPOSE.signin, prompt: "select_account", state }
      : { client_id: clientId()!, redirect_uri: redirectUri(), response_type: "code", scope: SCOPES_BY_PURPOSE[purpose] ?? SCOPES, include_granted_scopes: "true", access_type: "offline", prompt: "consent", state }
  );
  return `${AUTH_URL}?${params.toString()}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope: string; token_type: string };

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId()!,
      client_secret: clientSecret()!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId()!,
      client_secret: clientSecret()!,
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Tells Google to forget the grant, so disconnect really stops access (not only our copy of
 * the token). Best-effort: a token Google already revoked returns 400, which is fine. */
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  } catch {
    /* best effort */
  }
}

export async function getGoogleUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`);
  const data = await res.json();
  return data.email;
}

/** Returns a currently-valid access token for this integration, transparently
 * refreshing (and persisting the new token) if the stored one has expired or is about
 * to. Throws if there's no refresh token to fall back on — the connection needs to be
 * redone from the Connections page in that case, never silently faked. */
export async function getValidAccessToken(integration: Integration): Promise<string> {
  const expiringSoon = !integration.tokenExpiresAt || integration.tokenExpiresAt.getTime() < Date.now() + 60_000;
  if (integration.accessToken && !expiringSoon) return integration.accessToken;
  if (!integration.refreshToken) throw new Error("No refresh token on file — reconnect Gmail from Settings → Channels.");

  const refreshed = await refreshAccessToken(integration.refreshToken);
  await prisma.integration.update({
    where: { id: integration.id },
    data: { accessToken: refreshed.access_token, tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000) },
  });
  return refreshed.access_token;
}

function base64url(input: string) {
  return Buffer.from(input, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeHeaderWord(value: string) {
  // RFC 2047 encoded-word — lets a display name or subject carry non-ASCII safely.
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export type SendGmailParams = {
  accessToken: string;
  fromEmail: string;
  fromName?: string;
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
};

export async function sendGmailMessage(params: SendGmailParams): Promise<{ id: string }> {
  const from = params.fromName ? `${encodeHeaderWord(params.fromName)} <${params.fromEmail}>` : params.fromEmail;
  const lines = [
    `From: ${from}`,
    `To: ${params.to}`,
    `Subject: ${encodeHeaderWord(params.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
  ];
  if (params.replyTo) lines.push(`Reply-To: ${params.replyTo}`);
  if (params.inReplyTo) lines.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) lines.push(`References: ${params.references}`);
  const mime = `${lines.join("\r\n")}\r\n\r\n${params.body}`;

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64url(mime) }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { id: data.id };
}

export type FetchedGmailMessage = {
  id: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  messageIdHeader?: string;
  headers?: { listUnsubscribe?: string | null; listId?: string | null; precedence?: string | null; autoSubmitted?: string | null; replyTo?: string | null; messageId?: string | null };
  rawBody?: string;
};

/** Pulls the most recent inbox messages via the Gmail API — a real poll, not a
 * simulation. Real-time push would need a Cloud Pub/Sub topic and users.watch(), which
 * is a heavier setup than a hackathon-scoped OAuth connection can assume exists; this
 * is the honest, immediately-workable alternative, triggered on demand or by a cron. */
/** Gmail's own position marker for incremental sync: the mailbox's current history id. */
export async function getGmailHistoryId(accessToken: string): Promise<string | null> {
  const res = await fetch(`${GMAIL_API}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = (await res.json()) as { historyId?: string };
  return data.historyId ?? null;
}

/**
 * Message ids added to the inbox since `startHistoryId`, or null when Gmail no longer has
 * that history (404: the cursor is too old) — the caller falls back to the time window.
 */
export async function listGmailMessageIdsSince(accessToken: string, startHistoryId: string): Promise<{ ids: string[]; historyId: string | null } | null> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let historyId: string | null = null;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded", labelId: "INBOX", maxResults: "500", ...(pageToken ? { pageToken } : {}) });
    const res = await fetch(`${GMAIL_API}/history?${q}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Gmail history failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { history?: Array<{ messagesAdded?: Array<{ message?: { id?: string; labelIds?: string[] } }> }>; nextPageToken?: string; historyId?: string };
    for (const h of data.history ?? []) for (const a of h.messagesAdded ?? []) if (a.message?.id && (a.message.labelIds ?? ["INBOX"]).includes("INBOX")) ids.add(a.message.id);
    historyId = data.historyId ?? historyId;
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return { ids: [...ids], historyId };
}

export async function listRecentGmailMessages(accessToken: string, maxResults = 15, since?: Date | null): Promise<FetchedGmailMessage[]> {
  // category:primary leans on Gmail's own classifier to exclude promotions/social/updates
  // tabs — the same signal the Gmail web UI uses to keep newsletters out of the main
  // inbox view. Real customer inquiries land in Primary; a Redfin listing alert doesn't.
  // Everything in the inbox, not only Primary: Daythread's own classifier decides what is
  // automated, promotional or a vendor, and All Inbox keeps it all. Gmail's tabs are one
  // opinion; the product's is the one the owner can correct.
  // `after:` is Gmail's own epoch-seconds filter, so a burst of mail between two polls is
  // never skipped by a fixed page size: the window covers everything since the last sync
  // (with a day of overlap for clock skew and late delivery; duplicates are dropped on the
  // provider message id).
  const q = since ? `in:inbox after:${Math.floor((since.getTime() - 24 * 3600 * 1000) / 1000)}` : "in:inbox";
  const listRes = await fetch(`${GMAIL_API}/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status} ${await listRes.text()}`);
  const { messages } = (await listRes.json()) as { messages?: { id: string }[] };
  if (!messages?.length) return [];
  return fetchGmailMessages(accessToken, messages.map((m) => m.id));
}

/** Full messages for the given ids, in the given order; ids Gmail no longer returns are skipped. */
export async function fetchGmailMessages(accessToken: string, ids: string[]): Promise<FetchedGmailMessage[]> {
  const messages = ids.map((id) => ({ id }));
  const results: FetchedGmailMessage[] = [];
  for (const m of messages) {
    const res = await fetch(`${GMAIL_API}/messages/${m.id}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    const headers: { name: string; value: string }[] = data.payload?.headers ?? [];
    const header = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

    const fromHeader = header("From") ?? "";
    const displayMatch = fromHeader.match(/^"?([^"<]+?)"?\s*<(.+)>$/);
    const fromEmail = displayMatch?.[2]?.trim() ?? fromHeader.trim();
    const fromName = displayMatch?.[1]?.trim();

    const { text, html } = extractBodyParts(data.payload);

    results.push({
      id: data.id,
      from: fromEmail,
      fromName,
      subject: header("Subject") ?? "(no subject)",
      body: normalizeEmailContent({ text, html }),
      messageIdHeader: header("Message-ID") ?? undefined,
      // Bulk / automated signals travel with the message; classification decides, nothing is dropped.
      headers: {
        listUnsubscribe: header("List-Unsubscribe") ?? null,
        listId: header("List-Id") ?? null,
        precedence: header("Precedence") ?? null,
        autoSubmitted: header("Auto-Submitted") ?? null,
        replyTo: header("Reply-To") ?? null,
        messageId: header("Message-ID") ?? null,
      },
      rawBody: (text ?? html ?? "").slice(0, 8000),
    });
  }
  return results;
}

/** Walks Gmail's MIME part tree and pulls out the text/plain and text/html parts
 * separately (a multipart/alternative message carries both — normalizeEmailContent
 * decides which to actually use). Never returns raw markup as if it were the "text"
 * part; that was the bug that let unrendered HTML leak into the inbox. */
function extractBodyParts(payload: any): { text: string | null; html: string | null } {
  let text: string | null = null;
  let html: string | null = null;

  function walk(node: any) {
    if (!node) return;
    if (node.mimeType === "text/plain" && node.body?.data && !text) {
      text = decodeBase64Url(node.body.data);
    } else if (node.mimeType === "text/html" && node.body?.data && !html) {
      html = decodeBase64Url(node.body.data);
    } else if (node.parts) {
      for (const part of node.parts) walk(part);
    } else if (!node.mimeType?.startsWith("multipart/") && node.body?.data && !text && !html) {
      // Single-part message with no explicit mimeType match (rare) — treat as text.
      text = decodeBase64Url(node.body.data);
    }
  }

  walk(payload);
  return { text, html };
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}
