/**
 * Secrets the product cannot run safely without. In development a stable placeholder keeps
 * local work moving; in production a missing value throws at first use, so the deployment
 * fails loudly instead of signing sessions with a public string.
 */
const DEV_FALLBACK = "dev-only-insecure-secret";

export function requiredSecret(name: "JWT_SECRET"): string {
  const value = process.env[name];
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production") throw new Error(`${name} is not configured. Set it in the deployment's environment (at least 32 random characters) before serving traffic.`);
  return DEV_FALLBACK;
}

/** Names of variables production needs for the core product, checked by the setup page. */
export const CORE_PRODUCTION_VARS = ["DATABASE_URL", "JWT_SECRET", "NEXT_PUBLIC_APP_URL", "INTEGRATION_TOKEN_ENCRYPTION_KEY", "CRON_SECRET"] as const;
