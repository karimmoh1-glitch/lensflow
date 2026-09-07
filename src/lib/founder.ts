/**
 * Who may open the founder dashboard: the email addresses in FOUNDER_EMAILS, and nobody
 * else. Unset means the dashboard does not exist (404), so a deployment without it never
 * exposes cross-tenant aggregates by accident.
 */
export function founderEmails(): string[] {
  return (process.env.FOUNDER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isFounder(email: string | null | undefined): boolean {
  if (!email) return false;
  return founderEmails().includes(email.trim().toLowerCase());
}
