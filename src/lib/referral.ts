import { randomBytes } from "node:crypto";

/**
 * Referral codes: eight characters from an alphabet without look-alikes, unique per
 * workspace, generated only when the owner first opens their link. The code identifies a
 * workspace and nothing else — no name, no email — so a link can be shared anywhere.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const REFERRAL_CODE_RE = /^[a-z2-9]{8}$/;

export function generateReferralCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function isReferralCode(v: unknown): v is string {
  return typeof v === "string" && REFERRAL_CODE_RE.test(v);
}
