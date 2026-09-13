/**
 * Who may open the founder dashboard: the email addresses in FOUNDER_EMAILS, and nobody
 * else. Unset means the dashboard does not exist (404), so a deployment without it never
 * exposes cross-tenant aggregates by accident.
 */
export function founderEmails(): string[] {
  return (process.env.FOUNDER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/**
 * Accounts that existed before Daythread recorded email verification are trusted as they
 * were; every account made since must have proven its address. Without this, anyone could
 * register (or accept an invitation as) an unclaimed founder address and open the dashboard.
 */
export const EMAIL_VERIFICATION_TRACKED_SINCE = new Date("2026-09-13T07:00:00Z");

export function addressProven(user: { emailVerifiedAt?: Date | null; createdAt?: Date | null }): boolean {
  if (user.emailVerifiedAt) return true;
  return Boolean(user.createdAt && user.createdAt < EMAIL_VERIFICATION_TRACKED_SINCE);
}

/** Exact match on the stored (lower-case) address, and only for a proven address. */
export function isFounder(user: { email: string; emailVerifiedAt?: Date | null; createdAt?: Date | null } | null | undefined): boolean {
  if (!user?.email) return false;
  return founderEmails().includes(user.email) && addressProven(user);
}
