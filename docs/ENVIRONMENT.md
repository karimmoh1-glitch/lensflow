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
| `CRON_SECRET` | server | the daily cron answers 501; automations and calendar maintenance stop |
| `SEED_SECRET` | server | admin routes (`/api/admin/*`) refuse |

Optional for core: `INTEGRATION_TOKEN_ENCRYPTION_KEY_PREVIOUS` (only during key rotation), `OPENAI_API_KEY` (without it, extraction, drafts and the assistant use deterministic rule-based fallbacks and say so nowhere misleading).

## Required for Google (Gmail + Google Calendar)

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — server. Redirect URI in Google Cloud: `https://daythread.org/api/auth/google/callback`. Without them the two cards read "Configuration required".

## Required for Apple Calendar

None. Customers supply an Apple ID and an app-specific password, stored encrypted.

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

`npm run build` runs `prisma db push` (additive schema sync; it now fails instead of dropping data if a change would be destructive) and then `next build`. Deploy from a clean checkout of `main` with the Vercel CLI. The cron in `vercel.json` sends `Authorization: Bearer $CRON_SECRET` to `/api/cron/automations` daily at 13:00 UTC.

## Continue with Google (sign-in)

Uses the same Google OAuth client and the same redirect URI as the Gmail and Calendar
connections (`/api/auth/google/callback`), with identity scopes only (`openid`, `email`,
`profile`). Nothing extra is needed in code. In Google Cloud, the OAuth consent screen must
include the `email` and `profile` scopes (they are non-sensitive; no verification review is
needed for them), and `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` must be set. The button is
only rendered when they are. A Google account whose email Google has not verified is refused.
Accounts are linked by verified email: an existing password account signs in as itself, a new
address gets a user and their own workspace exactly as the signup form does.

## Annual billing

Yearly prices are created in Stripe on first use, next to the monthly ones, under the lookup
keys `daythread_pro_yearly` and `daythread_business_yearly` at ten months' price (two months
free). No Stripe dashboard configuration is needed beyond `STRIPE_SECRET_KEY` and the webhook.

## 7-day Pro trial

No Stripe dashboard configuration: the trial is a `trial_period_days: 7` on the checkout
session with `payment_method_collection: "always"` (card required) and
`missing_payment_method: cancel`. Stripe's own checkout page shows "7 days free, then $20/month".
The app offers it only to a business that has never had a subscription (`trialUsedAt` is null
and no `stripeSubscriptionId`), only for Pro, and decides that server-side; the webhook records
`trialEndsAt` / `trialUsedAt`. Requires `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, like
every other billing feature; without them the trial is not offered anywhere.

## Founder dashboard

`FOUNDER_EMAILS` — comma-separated email addresses of the people who may open `/admin/growth`. Unset (the default) means the page returns 404 for everyone. The signed-in user's email is compared case-insensitively; there is no other way in. Set it on production to the founders' own Daythread logins.
