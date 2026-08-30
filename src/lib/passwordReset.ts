import { randomBytes } from "crypto";

export const PASSWORD_RESET_TTL_MINUTES = 60;

/** A secure, unguessable token — never a database id or anything derived from user input. */
export function generatePasswordResetToken() {
  return randomBytes(24).toString("base64url");
}

export function passwordResetExpiry() {
  return new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
}
