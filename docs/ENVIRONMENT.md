# Environment variables

Never put values in this file or in git. Set production values in Vercel → Settings →
Environment Variables (Production). `NEXT_PUBLIC_*` reaches the browser; everything else is
server-only.

## Required for core Daythread (production fails or refuses without these)

| Variable | Scope | Behavior when missing |
|---|---|---|
| `DATABASE_URL` | server | Prisma cannot connect; build and requests fail |
| `JWT_SECRET` | server | throws at first use in production (sessions and OAuth state are signed with it); ≥32 random chars |
| `NEXT_PUBLIC_APP_URL` | public | must be `https://daythread.org`; OAuth callbacks and emails derive from it |
| `INTEGRATION_TOKEN_ENCRYPTION_KEY` | server | new credentials are refused ("Connections are paused"); existing ones cannot be decrypted |
| `CRON_SECRET` | server | the daily cron answers 501; channel maintenance (Instagram token refresh) stops |
| `SEED_SECRET` | server | admin routes (`/api/admin/*`) refuse |

Optional for core: `INTEGRATION_TOKEN_ENCRYPTION_KEY_PREVIOUS` (only during key rotation), `OPENAI_API_KEY` (without it, extraction, drafts and Copilot use deterministic rule-based fallbacks and say so nowhere misleading).

## Required for Google (Gmail)

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — server. Redirect URI in Google Cloud: `https://daythread.org/api/auth/google/callback`. Without them the two cards read "Configuration required".


## Required for Meta (Instagram + WhatsApp)

`INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_CONFIG_ID`, `META_WEBHOOK_VERIFY_TOKEN` — server. See `docs/integrations/meta.md`.

## Required for Twilio (SMS)

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` — server. Optional `TWILIO_FROM_NUMBER`. See `docs/integrations/twilio.md`.

## Required for Resend (product email)

`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `RESEND_INBOUND_DOMAIN` — server. Until set: password reset by email is refused in production, customer-facing sends from unconnected channels are recorded as not delivered. See `docs/email/PRODUCTION.md`.

## Required for Stripe (later, intentionally off today)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — server. Until set: upgrades are closed, the webhook answers 501, client card checkout falls back to the labeled simulated page. Nothing in the core product requires Stripe.

## Public-safe

Only `NEXT_PUBLIC_APP_URL`. No other variable may start with `NEXT_PUBLIC_`.

## Build and deploy

`npm run build` runs `prisma db push` (additive schema sync; it now fails instead of dropping data if a change would be destructive) and then `next build`. Deploy from a clean checkout of `main` with the Vercel CLI. The cron in `vercel.json` sends `Authorization: Bearer $CRON_SECRET` to `/api/cron/automations` (the path is historical; it now runs channel maintenance only) daily at 13:00 UTC.
