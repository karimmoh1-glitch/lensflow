import { randomBytes, createHash } from "crypto";

export const INVITATION_TTL_DAYS = 7;

/** A secure, unguessable token — never a database id or anything derived from user input. */
export function generateInvitationToken() {
  return randomBytes(24).toString("base64url");
}

/**
 * What is stored for an invitation: the token's SHA-256 under its own prefix. The token
 * itself only ever exists in the email and the link, so a copy of the database — a
 * replica, a backup, a logged query — cannot accept anyone's invitation.
 */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(`invite:${token}`).digest("base64url");
}

/**
 * A link issued before tokens were hashed (valid for a week at most) holds the raw token in
 * the database. Only input shaped like a raw token — 24 bytes, 32 base64url characters — may
 * be looked up that way; a stored hash is 43 characters, so presenting a copied hash as a
 * link can never match the hashed row it came from.
 */
export function isLegacyInvitationToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}

export function invitationExpiry() {
  return new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
