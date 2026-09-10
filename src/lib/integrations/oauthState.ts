import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "crypto";

/**
 * One OAuth `state` for every provider. The state round-trips through the provider and
 * back to a public callback, so it is (1) signed, so it can't be forged or altered;
 * (2) bound to the browser that started the flow by a random nonce in an httpOnly cookie,
 * so a victim can't be tricked into completing an attacker's flow (which would link the
 * victim's account into the attacker's business); (3) single-use — the cookie is deleted
 * on first verification; (4) short-lived — ten minutes; (5) tied to a provider and a
 * purpose, so a Gmail state can never complete a Calendar callback.
 */
export const OAUTH_PROVIDERS = ["google", "instagram", "whatsapp", "microsoft", "slack", "dropbox", "calendly", "stripe"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
/** What a grant is for. A provider can serve several (Google: Gmail, Calendar, Drive, sign-in). */
export const OAUTH_PURPOSES = ["gmail", "calendar", "messaging", "signin", "drive", "mail", "files", "notifications", "scheduling", "payments"] as const;
export type OAuthPurpose = (typeof OAUTH_PURPOSES)[number];

const COOKIE = Object.fromEntries(OAUTH_PROVIDERS.map((p) => [p, `${p}_oauth_nonce`])) as Record<OAuthProvider, string>;
const PKCE_COOKIE = Object.fromEntries(OAUTH_PROVIDERS.map((p) => [p, `${p}_oauth_pkce`])) as Record<OAuthProvider, string>;
const isPurpose = (v: unknown): v is OAuthPurpose => typeof v === "string" && (OAUTH_PURPOSES as readonly string[]).includes(v);

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("JWT_SECRET is not configured.");
  return new TextEncoder().encode(s || "dev-only-insecure-secret");
}

export async function signOAuthState(input: { provider: OAuthProvider; purpose: OAuthPurpose; businessId: string; userId: string }): Promise<string> {
  const nonce = randomBytes(24).toString("hex");
  const store = await cookies();
  store.set(COOKIE[input.provider], nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 10 });
  return new SignJWT({ businessId: input.businessId, userId: input.userId, nonce, provider: input.provider, purpose: input.purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
}

export type VerifiedState = { businessId: string; userId: string; purpose: OAuthPurpose };
export type StateFailure = "missing" | "invalid" | "expired" | "wrong_provider" | "nonce_mismatch";

export async function verifyOAuthState(provider: OAuthProvider, state: string | null): Promise<{ ok: true; state: VerifiedState } | { ok: false; reason: StateFailure }> {
  if (!state) return { ok: false, reason: "missing" };
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(state, secret()));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    return { ok: false, reason: code === "ERR_JWT_EXPIRED" ? "expired" : "invalid" };
  }
  if (typeof payload.businessId !== "string" || typeof payload.userId !== "string" || typeof payload.nonce !== "string") return { ok: false, reason: "invalid" };
  if (payload.provider !== provider) return { ok: false, reason: "wrong_provider" };
  const store = await cookies();
  const cookieNonce = store.get(COOKIE[provider])?.value;
  // Single use: the cookie is consumed whether or not it matches.
  store.delete(COOKIE[provider]);
  if (!cookieNonce || cookieNonce !== payload.nonce) return { ok: false, reason: "nonce_mismatch" };
  const purpose = payload.purpose;
  if (!isPurpose(purpose)) return { ok: false, reason: "invalid" };
  return { ok: true, state: { businessId: payload.businessId, userId: payload.userId, purpose } };
}

/**
 * PKCE for providers that require it (Dropbox) or recommend it (Microsoft): the verifier
 * lives only in an httpOnly cookie on the browser that started the flow, the challenge goes
 * to the provider. Consumed once, in the callback, alongside the state.
 */
export async function beginPkce(provider: OAuthProvider): Promise<{ codeChallenge: string }> {
  const verifier = randomBytes(48).toString("base64url");
  const store = await cookies();
  store.set(PKCE_COOKIE[provider], verifier, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 10 });
  return { codeChallenge: createHash("sha256").update(verifier).digest("base64url") };
}

export async function consumePkce(provider: OAuthProvider): Promise<string | null> {
  const store = await cookies();
  const verifier = store.get(PKCE_COOKIE[provider])?.value ?? null;
  store.delete(PKCE_COOKIE[provider]);
  return verifier;
}

/** Pure verification for tests and non-request contexts: signature, expiry, provider, and
 * an explicitly supplied nonce (what the cookie would carry). */
export async function verifyOAuthStateWithNonce(provider: OAuthProvider, state: string | null, cookieNonce: string | null): Promise<{ ok: true; state: VerifiedState } | { ok: false; reason: StateFailure }> {
  if (!state) return { ok: false, reason: "missing" };
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(state, secret()));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    return { ok: false, reason: code === "ERR_JWT_EXPIRED" ? "expired" : "invalid" };
  }
  if (typeof payload.businessId !== "string" || typeof payload.userId !== "string" || typeof payload.nonce !== "string") return { ok: false, reason: "invalid" };
  if (payload.provider !== provider) return { ok: false, reason: "wrong_provider" };
  if (!cookieNonce || cookieNonce !== payload.nonce) return { ok: false, reason: "nonce_mismatch" };
  const purpose = payload.purpose;
  if (!isPurpose(purpose)) return { ok: false, reason: "invalid" };
  return { ok: true, state: { businessId: payload.businessId, userId: payload.userId, purpose } };
}

/** Sign without touching cookies (tests); returns the nonce so a test can present it. */
export async function signOAuthStateRaw(input: { provider: OAuthProvider; purpose: OAuthPurpose; businessId: string; userId: string; nonce?: string; expiresIn?: string }): Promise<{ state: string; nonce: string }> {
  const nonce = input.nonce ?? randomBytes(24).toString("hex");
  const state = await new SignJWT({ businessId: input.businessId, userId: input.userId, nonce, provider: input.provider, purpose: input.purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(input.expiresIn ?? "10m")
    .sign(secret());
  return { state, nonce };
}
