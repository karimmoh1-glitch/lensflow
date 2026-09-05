import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Encryption at rest for provider credentials (Integration.accessToken / refreshToken —
 * OAuth tokens, an iCloud app-specific password). AES-256-GCM: authenticated, so a
 * tampered ciphertext fails to decrypt rather than returning garbage that gets sent to a
 * provider as a bearer token.
 *
 * Keys: INTEGRATION_TOKEN_ENCRYPTION_KEY is the current key; an optional
 * INTEGRATION_TOKEN_ENCRYPTION_KEY_PREVIOUS lets a rotation decrypt old rows while new
 * writes use the new key (see /api/admin/reencrypt-tokens to finish a rotation).
 *
 * Production fails safe: with no key configured, nothing new can be encrypted (connecting
 * an integration is refused with a clear message) and existing rows are still readable
 * through the dev fallback so current connections keep working while the operator fixes
 * the environment. Outside production the fallback is used with a warning.
 */
const FALLBACK_KEY_MATERIAL = "dev-only-insecure-token-encryption-key";
const SALT = "daythread-integration-token-v1";
const IV_LENGTH = 12;
const PREFIX = "v1:";

const isProduction = process.env.NODE_ENV === "production";
let warned = false;
const derived = new Map<string, Buffer>();
function derive(material: string): Buffer {
  const hit = derived.get(material);
  if (hit) return hit;
  const key = scryptSync(material, SALT, 32);
  derived.set(material, key);
  return key;
}

export function tokenCryptoConfigured(): boolean {
  return Boolean(process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY);
}

function currentKey(): Buffer {
  const material = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
  if (material) return derive(material);
  if (isProduction) {
    throw new Error("INTEGRATION_TOKEN_ENCRYPTION_KEY is not configured on this deployment, so no new credentials can be stored.");
  }
  if (!warned) {
    warned = true;
    console.warn("[tokenCrypto] INTEGRATION_TOKEN_ENCRYPTION_KEY is not set — using a dev-only key. Set a real random value in production.");
  }
  return derive(FALLBACK_KEY_MATERIAL);
}

/** Every key a stored token might have been written with, newest first. */
function candidateKeys(): Buffer[] {
  const keys: Buffer[] = [];
  const cur = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
  const prev = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY_PREVIOUS;
  if (cur) keys.push(derive(cur));
  if (prev) keys.push(derive(prev));
  keys.push(derive(FALLBACK_KEY_MATERIAL));
  return keys;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", currentKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Null on any failure (unknown key, corrupted data, pre-encryption plaintext) — a token
 * that won't decrypt reads as "reconnect needed", never as a usable bearer token. */
export function decryptToken(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return null;
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  for (const key of candidateKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      /* try the next key */
    }
  }
  return null;
}

/** True when the ciphertext was written with the current key (so a rotation is complete for this row). */
export function encryptedWithCurrentKey(stored: string): boolean {
  if (!stored.startsWith(PREFIX) || !process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY) return false;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const decipher = createDecipheriv("aes-256-gcm", derive(process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY), raw.subarray(0, IV_LENGTH));
    decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + 16));
    decipher.update(raw.subarray(IV_LENGTH + 16));
    decipher.final();
    return true;
  } catch {
    return false;
  }
}
