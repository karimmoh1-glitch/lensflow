import { prisma } from "@/lib/db";
import type { Integration } from "@prisma/client";

/**
 * The parts of OAuth 2 that every provider shares: a form-encoded token request, a
 * refresh that persists the new token, and one error type that carries the provider's
 * status so callers can tell "revoked" from "down". Provider modules add the endpoints,
 * scopes and identity calls; nothing here logs a token or a body.
 */
export class OAuthError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = "OAuthError";
  }
  /** The grant is gone (revoked, expired, consent withdrawn) rather than the provider being unreachable. */
  get revoked(): boolean {
    return this.status === 400 && /invalid_grant|invalid_token|token_revoked|expired/i.test(`${this.code ?? ""} ${this.message}`) || this.status === 401;
  }
}

export type OAuthTokens = { accessToken: string; refreshToken?: string | null; expiresAt: Date | null; scope?: string | null; raw: Record<string, unknown> };

export const TOKEN_TIMEOUT_MS = 15_000;

/** POST x-www-form-urlencoded to a token endpoint and normalize the answer. */
export async function tokenRequest(url: string, params: Record<string, string>, opts: { basicAuth?: { id: string; secret: string } } = {}): Promise<OAuthTokens> {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (opts.basicAuth) headers.Authorization = `Basic ${Buffer.from(`${opts.basicAuth.id}:${opts.basicAuth.secret}`).toString("base64")}`;
  // A token endpoint that hangs must not hold a callback, a sync, or the refresh lock below.
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body: new URLSearchParams(params), signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new OAuthError(`Token endpoint ${timedOut ? "did not answer in time" : "could not be reached"}`, 0, timedOut ? "timeout" : "network");
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? (JSON.parse(text) as Record<string, unknown>) : {}; } catch { data = {}; }
  if (!res.ok || typeof data.access_token !== "string") {
    const code = typeof data.error === "string" ? data.error : typeof data.error_summary === "string" ? data.error_summary : undefined;
    throw new OAuthError(`Token request failed (${res.status})${code ? `: ${code}` : ""}`, res.status, code);
  }
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : typeof data.expires_in === "string" ? Number(data.expires_in) : null;
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresAt: expiresIn && Number.isFinite(expiresIn) ? new Date(Date.now() + expiresIn * 1000) : null,
    scope: typeof data.scope === "string" ? data.scope : null,
    raw: data,
  };
}

/**
 * A currently valid access token for a row, refreshing and persisting when the stored one
 * is within a minute of expiry. A provider that rotates refresh tokens (Microsoft, Calendly)
 * has the new one saved too. Throws OAuthError when the grant is gone: the row needs a
 * reconnect, never a silent stand-in.
 */
const fresh = (row: { accessToken: string | null; tokenExpiresAt: Date | null }) =>
  Boolean(row.accessToken && row.tokenExpiresAt && row.tokenExpiresAt.getTime() >= Date.now() + 60_000);

/**
 * A usable access token for this connection, refreshing it when it is about to expire.
 *
 * Refreshes are serialised per connection. Zoom, Calendly and Microsoft rotate refresh
 * tokens: the old one dies the moment it is used. Two requests arriving together used to
 * both refresh with the same token — the first succeeded, the second was refused as a
 * reused grant, and a connection that was perfectly healthy was reported as revoked. Now
 * the second waits on the row, re-reads it, and uses the token the first one stored.
 */
export async function validAccessToken(integration: Integration, refresh: (refreshToken: string) => Promise<OAuthTokens>, opts: { label: string }): Promise<string> {
  if (fresh(integration)) return integration.accessToken!;
  // No refresh token but a token without a known expiry (Slack bot tokens, Stripe): use it.
  if (integration.accessToken && !integration.refreshToken && !integration.tokenExpiresAt) return integration.accessToken;
  if (!integration.refreshToken) throw new OAuthError(`No refresh token on file — reconnect ${opts.label} from Settings → Channels.`, 401, "no_refresh_token");

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Integration" WHERE "id" = ${integration.id} FOR UPDATE`;
      const current = await tx.integration.findUnique({ where: { id: integration.id }, select: { accessToken: true, refreshToken: true, tokenExpiresAt: true } });
      if (!current) throw new OAuthError(`${opts.label} was disconnected.`, 401, "no_refresh_token");
      // Somebody else refreshed while this request waited for the lock.
      if (fresh(current)) return current.accessToken!;
      if (!current.refreshToken) throw new OAuthError(`No refresh token on file — reconnect ${opts.label} from Settings → Channels.`, 401, "no_refresh_token");
      const t = await refresh(current.refreshToken);
      await tx.integration.update({ where: { id: integration.id }, data: { accessToken: t.accessToken, tokenExpiresAt: t.expiresAt, ...(t.refreshToken ? { refreshToken: t.refreshToken } : {}) } });
      return t.accessToken;
    },
    { timeout: TOKEN_TIMEOUT_MS + 10_000, maxWait: TOKEN_TIMEOUT_MS + 10_000 },
  );
}

/** JSON call against a provider API with a bearer token; errors carry the status. */
export async function bearerJson<T = unknown>(url: string, accessToken: string, init: Omit<RequestInit, "body"> & { body?: unknown } = {}): Promise<T> {
  const body = init.body !== undefined && typeof init.body !== "string" ? JSON.stringify(init.body) : (init.body as string | undefined);
  const res = await fetch(url, { ...init, body, headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(init.headers as Record<string, string> | undefined) } });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: { code?: string; message?: string } | string; error_summary?: string; message?: string };
    const code = typeof d.error === "object" && d.error ? d.error.code : typeof d.error === "string" ? d.error : d.error_summary;
    const msg = typeof d.error === "object" && d.error ? d.error.message : d.message;
    throw new OAuthError(`${new URL(url).host} answered ${res.status}${code ? ` ${code}` : ""}${msg ? `: ${msg.slice(0, 160)}` : ""}`, res.status, code);
  }
  return data as T;
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
