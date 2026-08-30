import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import type { Integration } from "@prisma/client";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

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
const stateSecret = () => new TextEncoder().encode(process.env.JWT_SECRET || "dev-only-insecure-secret");

export async function signGoogleState(businessId: string) {
  return new SignJWT({ businessId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(stateSecret());
}

export async function verifyGoogleState(state: string): Promise<{ businessId: string } | null> {
  try {
    const { payload } = await jwtVerify(state, stateSecret());
    return typeof payload.businessId === "string" ? { businessId: payload.businessId } : null;
  } catch {
    return null;
  }
}

export async function getGoogleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: clientId()!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
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
  if (!integration.refreshToken) throw new Error("No refresh token on file — reconnect Gmail from Settings → Connections.");

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
};

/** Pulls the most recent inbox messages via the Gmail API — a real poll, not a
 * simulation. Real-time push would need a Cloud Pub/Sub topic and users.watch(), which
 * is a heavier setup than a hackathon-scoped OAuth connection can assume exists; this
 * is the honest, immediately-workable alternative, triggered on demand or by a cron. */
export async function listRecentGmailMessages(accessToken: string, maxResults = 15): Promise<FetchedGmailMessage[]> {
  const listRes = await fetch(`${GMAIL_API}/messages?maxResults=${maxResults}&q=${encodeURIComponent("in:inbox")}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status} ${await listRes.text()}`);
  const { messages } = (await listRes.json()) as { messages?: { id: string }[] };
  if (!messages?.length) return [];

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

    results.push({
      id: data.id,
      from: fromEmail,
      fromName,
      subject: header("Subject") ?? "(no subject)",
      body: extractPlainTextBody(data.payload) ?? "(no content)",
      messageIdHeader: header("Message-ID") ?? undefined,
    });
  }
  return results;
}

function extractPlainTextBody(payload: any): string | null {
  if (!payload) return null;
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (plain?.body?.data) return decodeBase64Url(plain.body.data);
    for (const part of payload.parts) {
      const nested = extractPlainTextBody(part);
      if (nested) return nested;
    }
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return null;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}
