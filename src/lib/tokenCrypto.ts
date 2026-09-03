import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Encryption at rest for OAuth tokens (Integration.accessToken/refreshToken). AES-256-GCM
 * — authenticated encryption, so a tampered ciphertext fails to decrypt rather than
 * silently returning garbage that gets sent to Google as a bearer token.
 *
 * Key comes from INTEGRATION_TOKEN_ENCRYPTION_KEY (any string; run through scrypt to
 * derive a proper 32-byte key, so the env var itself doesn't need to be exactly 32 bytes
 * of high-entropy input — a long random string is enough). Falls back to a dev-only
 * fixed key when unset, matching this codebase's existing convention for optional
 * production secrets (see stateSecret() in lib/google.ts) — real Gmail integrations keep
 * working out of the box in local/demo environments, but production must set a real key
 * or every stored token is only as safe as a publicly-known fallback string.
 */
const FALLBACK_KEY_MATERIAL = "dev-only-insecure-token-encryption-key";
const SALT = "daythread-integration-token-v1"; // fixed salt is fine here: scrypt's job is
// stretching the key material into a proper-length key, not resisting a rainbow table —
// the actual secret is the env var, not the salt.

let cachedKey: Buffer | null = null;
let warnedFallback = false;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const material = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
  if (!material && !warnedFallback) {
    warnedFallback = true;
    console.warn(
      "[tokenCrypto] INTEGRATION_TOKEN_ENCRYPTION_KEY is not set — falling back to a publicly-known dev key. " +
        "Set a real random value in production before connecting any real Gmail account."
    );
  }
  cachedKey = scryptSync(material ?? FALLBACK_KEY_MATERIAL, SALT, 32);
  return cachedKey;
}

const IV_LENGTH = 12; // GCM's recommended nonce size
const PREFIX = "v1:"; // lets a future key/algorithm rotation tell old ciphertexts apart

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Returns null on any decryption failure (wrong/rotated key, corrupted data, or a
 * pre-encryption plaintext value left over from before this was added) rather than
 * throwing — a stored token failing to decrypt should read as "not connected" and prompt
 * a reconnect, never crash the page or silently leak raw bytes to a caller expecting a
 * usable bearer token. */
export function decryptToken(stored: string): string | null {
  try {
    if (!stored.startsWith(PREFIX)) return null; // pre-encryption plaintext, or foreign data
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = raw.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (err) {
    console.error("[tokenCrypto] failed to decrypt a stored token", err);
    return null;
  }
}
