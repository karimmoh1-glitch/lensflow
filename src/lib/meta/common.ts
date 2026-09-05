import { createHmac, timingSafeEqual } from "crypto";

/** Meta Graph API version pinned for every call. */
export const GRAPH = "https://graph.facebook.com/v21.0";
export const IG_GRAPH = "https://graph.instagram.com/v21.0";

export class MetaApiError extends Error {
  constructor(public status: number, public code: number | null, message: string) {
    super(message);
  }
}

export async function graphFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: number } } | null)?.error;
    throw new MetaApiError(res.status, err?.code ?? null, err?.message ?? `Meta ${res.status}`);
  }
  return json as T;
}

/** X-Hub-Signature-256 verification for Meta webhooks: HMAC-SHA256 of the raw body with the
 * app secret, compared in constant time. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const given = header.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

/** Meta's token-revoked / expired error codes: 190 (invalid OAuth token), 102 (session),
 * with subcodes for expiry (463) and password change (460). */
export function isTokenInvalid(err: unknown): boolean {
  return err instanceof MetaApiError && (err.code === 190 || err.code === 102 || err.status === 401);
}
