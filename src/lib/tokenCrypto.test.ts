import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "./tokenCrypto";

describe("tokenCrypto", () => {
  it("round-trips a token through encrypt then decrypt", () => {
    const plain = "ya29.a0AfH6SMB_real_looking_access_token_value";
    const encrypted = encryptToken(plain);
    expect(encrypted).not.toBe(plain);
    expect(decryptToken(encrypted)).toBe(plain);
  });

  it("never stores the plaintext token as a substring of the ciphertext", () => {
    const plain = "1//0gSecretRefreshTokenValue";
    const encrypted = encryptToken(plain);
    expect(encrypted).not.toContain(plain);
  });

  it("two encryptions of the same plaintext produce different ciphertext (random IV)", () => {
    const plain = "same-token-value";
    expect(encryptToken(plain)).not.toBe(encryptToken(plain));
  });

  it("returns null instead of throwing on a corrupted ciphertext", () => {
    const encrypted = encryptToken("a-real-token");
    const corrupted = encrypted.slice(0, -4) + "abcd";
    expect(decryptToken(corrupted)).toBeNull();
  });

  it("returns null for a pre-encryption plaintext value rather than mis-decrypting it", () => {
    // A row written before this encryption layer existed would have a raw token in the
    // column — must read as "not connected" (prompting a reconnect), never crash.
    expect(decryptToken("ya29.rawPlaintextToken")).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(decryptToken("not-even-base64-!!!")).toBeNull();
    expect(decryptToken("")).toBeNull();
  });
});
