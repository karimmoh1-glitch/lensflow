import { randomBytes } from "crypto";

export const INVITATION_TTL_DAYS = 7;

/** A secure, unguessable token — never a database id or anything derived from user input. */
export function generateInvitationToken() {
  return randomBytes(24).toString("base64url");
}

export function invitationExpiry() {
  return new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
