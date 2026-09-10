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

## AI: spend controls, telemetry and the incident switch

`OPENAI_API_KEY` enables the model. `AI_DISABLED=true` stops every request without removing
the key, which is the switch to use during an incident: drafts, summaries and message
reading fall back to Daythread's own deterministic wording, exactly as they do on a
deployment with no key at all, and the Status page says the model is switched off
deliberately rather than missing. Unset or `false` preserves current behaviour.

Every call is capped and counted. The numbers live in one file, `src/lib/aiPolicy.ts`:

| Control | Value |
|---|---|
| Model | `gpt-4o-mini` |
| Output cap | 200 tokens reading a message, 300 a draft, 500 an assistant answer, 100 a summary |
| Input cap | 6,000 characters of customer text per call, head and tail kept |
| Drafts | 60 per hour per workspace |
| Assistant proposal drafts | 30 per hour per workspace |
| Forced re-summaries | 30 per hour per workspace |
| Message reading | 200 per day per workspace |
| Message summaries | 40 per hour per workspace, 120 output tokens, cached on the message |
| Assistant questions | 40 per hour per workspace |
| Every AI call | 500 per day per workspace |

Limits are enforced on the server before a request goes out, counted from the recorded
calls themselves so they hold across every serverless instance. A cached thread summary
answers without a model call and counts against nothing. Being throttled is told to the
person plainly; a missing key or a deliberate switch-off is not, because those fall through
to the wording Daythread writes itself.

Usage is one `ai_call` row per call in `AnalyticsEvent`, carrying the feature, model, token
counts, latency, success and an estimated cost, and never a prompt, a message, a name or a
key. Estimated cost is tokens multiplied by the published list price in `aiPolicy.ts`
(gpt-4o-mini at $0.15 per million input tokens and $0.60 per million output). It is an
estimate: cached-input and batch discounts are not modelled. Update `PRICING` there when
OpenAI's prices change and every figure follows.

Founders watch it at `/admin/growth` under "AI usage, last 24 hours": spend, calls, tokens,
median latency, failures by kind, refusals, a per-workspace table and the current limits.
Failures also land in `OpsEvent` with area `ai`, and the Status page shows a count when the
model is configured but failing.

## Complimentary access

`COMPED_BUSINESS_EMAILS` is a comma-separated list of addresses that receive Business on
the workspaces they own, applied at their next signup or sign-in so an account that does
not exist yet is covered the moment it does. It writes `Business.compedPlan` and never
`planTier` or `billingStatus`, so Stripe remains the only source of truth for what anyone
pays and a comped workspace is never counted in MRR or in "paying now". The subscription
page tells the owner their access is complimentary and that nothing is charged. Removing an
address stops new grants; it does not revoke one already given.

## Mobile app

`EXPO_ACCESS_TOKEN` — server, optional. Sent as a bearer to Expo's push service (`exp.host`) when set; push works without it unless enhanced push security is turned on in the Expo project. Push tokens are stored on `OrgMembership.pushTokens`; a token Expo reports as unregistered is dropped.

The app itself reads one variable at build time: `EXPO_PUBLIC_API_URL` in `mobile/.env` — the origin of this deployment (`https://daythread.org` in production, a LAN IP or `http://localhost:3100` in development).

## Canonical integration variables

Every value is server-only unless its name starts with `NEXT_PUBLIC_`; the only public one is
`NEXT_PUBLIC_APP_URL`. "Now" means required for the current production product.

| Variable | Purpose | Required | From | Env | Secret |
|---|---|---|---|---|---|
| `DATABASE_URL` | Postgres | Now | Neon | all | yes |
| `JWT_SECRET` | Sessions, OAuth state | Now | generated | all | yes |
| `INTEGRATION_TOKEN_ENCRYPTION_KEY` | Tokens at rest | Now | generated | prod | yes |
| `CRON_SECRET` | Daily cron auth | Now | Vercel cron | prod | yes |
| `NEXT_PUBLIC_APP_URL` | Redirect URIs, webhook URLs | Now | `https://daythread.org` | all | no |
| `FOUNDER_EMAILS` | Founder dashboard | Now | you | prod | no |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Instagram Login + signatures | Instagram | Meta app → Instagram → API setup with Instagram login → Business login settings | prod | secret |
| `META_WEBHOOK_VERIFY_TOKEN` | Meta webhook handshake | Instagram, WhatsApp | generated, pasted into Meta | prod | yes |
| `META_APP_ID` / `META_APP_SECRET` / `WHATSAPP_CONFIG_ID` | WhatsApp Embedded Signup + signatures | WhatsApp | Meta app → Settings → Basic; WhatsApp → Embedded Signup | prod | secret |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | SMS numbers, sends, webhook signatures | SMS | Twilio Console → Account Info | prod | yes |
| `TWILIO_FROM_NUMBER` | Shared fallback sender | No | Twilio | prod | no |
| `TWILIO_PHONE_NUMBER` | Alias of `TWILIO_FROM_NUMBER` | No | Twilio | prod | no |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Outlook mail + calendar | Microsoft | Entra app registration → docs/integrations/microsoft.md | prod | secret |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | Slack notices | Slack | Slack app → docs/integrations/slack.md | prod | secret |
| `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` | Dropbox folders | Dropbox | Dropbox app → docs/integrations/files.md | prod | secret |
| `CALENDLY_CLIENT_ID` / `CALENDLY_CLIENT_SECRET` | Calendly import + webhooks | Calendly | developer.calendly.com → docs/integrations/calendly.md | prod | secret |
| `STRIPE_CONNECT_CLIENT_ID` / `STRIPE_CONNECT_WEBHOOK_SECRET` | Businesses' own Stripe accounts | Stripe (business) | Stripe Connect → docs/integrations/stripe.md | prod | secret |
| `INTEGRATION_INSTAGRAM_MODE` | `invite` (default) · `open` · `off` | No | you | prod | no |
| `INTEGRATION_WHATSAPP_MODE` | `coming_soon` (default) · `open` · `off` | No | you | prod | no |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail, Google Calendar, Google sign-in | Gmail | Google Cloud → OAuth client | prod | secret |
| `RESEND_API_KEY` | Password reset, notifications, outbound email | Now | Resend | prod | yes |
| `RESEND_WEBHOOK_SECRET` / `RESEND_INBOUND_DOMAIN` | Inbound email | Inbound email | Resend | prod | secret / no |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Billing | Paid plans | Stripe | prod | yes / yes / no |
| `OPENAI_API_KEY` | Drafts, summaries, assistant | AI | OpenAI | prod | yes |
| `AI_DISABLED` | Kill switch | No | you | prod | no |
| `COMPED_BUSINESS_EMAILS` | Complimentary plans | No | you | prod | no |
| `EXPO_ACCESS_TOKEN` | Push via Expo (optional auth) | No | Expo | prod | yes |

A missing optional integration variable degrades that channel to "not available on this
deployment"; nothing else fails.
