import { createHmac, timingSafeEqual } from "crypto";

/** Meta Graph API version pinned for every call. */
export const GRAPH = "https://graph.facebook.com/v21.0";
export const IG_GRAPH = "https://graph.instagram.com/v21.0";

export class MetaApiError extends Error {
  constructor(public status: number, public code: number | null, message: string, public subcode: number | null = null, public type: string | null = null) {
    super(message);
    this.name = "MetaApiError";
  }
}

/** Meta stops responding long before a serverless function times out; a hung provider must
 * not hold a webhook or a callback open. */
export const META_TIMEOUT_MS = 12_000;

export async function graphFetch<T>(url: string, init: RequestInit = {}, timeoutMs = META_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw new MetaApiError(504, null, "Meta did not respond in time.");
    throw new MetaApiError(502, null, "Meta could not be reached.");
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: number; error_subcode?: number; type?: string } } | null)?.error;
    throw new MetaApiError(res.status, err?.code ?? null, err?.message ?? `Meta ${res.status}`, err?.error_subcode ?? null, err?.type ?? null);
  }
  // A 200 whose body isn't the JSON object the caller expects is a provider fault, not data.
  if (json === null && text.trim() !== "") throw new MetaApiError(502, null, "Meta returned a response that could not be read.");
  return json as T;
}

const HEX_64 = /^[0-9a-f]{64}$/i;

/**
 * X-Hub-Signature-256 verification for Meta webhooks: HMAC-SHA256 of the raw body with the
 * app secret, compared in constant time.
 *
 * The header is attacker-controlled, so it is validated as 64 hex characters *before* it
 * reaches Buffer.from(…, "hex") — that parser stops at the first non-hex character and
 * returns a short buffer, which made timingSafeEqual throw a RangeError and turned a forged
 * signature into a 500 instead of a 401.
 */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const prefix = "sha256=";
  if (!header.startsWith(prefix)) return false;
  const given = header.slice(prefix.length);
  if (!HEX_64.test(given)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const givenBuf = Buffer.from(given, "hex");
  if (givenBuf.length !== expected.length) return false;
  return timingSafeEqual(givenBuf, expected);
}

/** Constant-time comparison for the webhook verification handshake's shared token. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Meta's token-revoked / expired error codes: 190 (invalid OAuth token) and 102 (session),
 * plus 200/10 for a permission that was removed rather than a token that died. A 401 from
 * the edge counts too. Anything else is a transient or request-specific failure and must
 * not flip a working connection to "reconnect".
 */
export function isTokenInvalid(err: unknown): boolean {
  if (!(err instanceof MetaApiError)) return false;
  if (err.status === 504 || err.status === 502) return false;
  return err.code === 190 || err.code === 102 || err.status === 401;
}

/** A permission the business never granted (or later removed) — reconnect with consent. */
export function isPermissionError(err: unknown): boolean {
  return err instanceof MetaApiError && (err.code === 200 || err.code === 10 || err.code === 3);
}

/** Meta's "outside the 24-hour customer service window" rejection. */
export const WA_REENGAGEMENT_CODE = 131047;
export function isOutsideServiceWindow(err: unknown): boolean {
  return err instanceof MetaApiError && err.code === WA_REENGAGEMENT_CODE;
}

/**
 * A provider error rendered for a person: never a token, never a raw Graph payload, never
 * an internal id. Meta's own message is used when it is safe and useful; otherwise a plain
 * sentence. Long messages are truncated — Meta sometimes echoes the whole request.
 */
export function userFacingMetaError(err: unknown, fallback: string): string {
  if (!(err instanceof MetaApiError)) return fallback;
  if (err.status === 504) return "Meta didn't respond in time. Nothing was sent — try again.";
  if (err.status === 502) return "Meta couldn't be reached just now. Nothing was sent — try again.";
  if (err.status >= 500) return "Meta had a problem on their side. Nothing was sent — try again in a minute.";
  if (isOutsideServiceWindow(err)) return "WhatsApp only allows a free-form reply within 24 hours of the customer's last message. An approved template is required after that.";
  if (isTokenInvalid(err)) return "The connection to Meta is no longer valid. Reconnect it in Settings → Integrations.";
  if (isPermissionError(err)) return "Meta refused this because a required permission isn't granted. Reconnect and approve everything it asks for.";
  return scrubMetaMessage(err.message) || fallback;
}

/** Strips anything credential-shaped out of a provider message before it is shown or stored. */
export function scrubMetaMessage(message: string): string {
  return message
    .replace(/\b(EAA|IGAA|IGQ)[A-Za-z0-9_-]{6,}/g, "[token]")
    .replace(/\b(client_secret|access_token|app_secret)=[^&\s]+/gi, "$1=[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 200);
}
