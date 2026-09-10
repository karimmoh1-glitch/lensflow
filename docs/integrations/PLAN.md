# Integrations system — audit and plan

Written before implementation, from what is actually in the repository at `origin/main`
(commit 0048031). Nothing below is aspirational: "live" means the code path exists,
is tested, and completes against the real provider.

## What exists today

| Area | State | Where |
|---|---|---|
| Gmail (read, reply, threads, history-id delta sync, on-demand reconcile, daily cron) | Live | `src/lib/google.ts`, `src/server/gmailSync.ts`, `src/app/api/auth/google/callback/route.ts` |
| Google Calendar (busy pull with sync tokens, booking mirror create/update/cancel) | Live | `src/lib/googleCalendar.ts`, `src/server/calendarSync.ts` |
| Apple Calendar (CalDAV, app-specific password) | Live | `src/lib/caldav.ts`, `src/app/actions/connect.ts` |
| Twilio SMS (platform-owned numbers, signed inbound + status webhooks) | Live, no credentials in production yet | `src/lib/twilio.ts`, `src/app/api/webhooks/twilio/*` |
| Booking page + contact form (`/book/[handle]`, `/embed/[handle]`) | Live, always on | `src/app/actions/websiteLead.ts`, `src/app/actions/publicBooking.ts` |
| Instagram (Instagram Login OAuth, signed Meta webhooks, identity repair, reconcile) | Code live; blocked on Meta app review / tester roles | `src/lib/meta/*`, `src/server/metaInbound.ts`, `src/server/instagramSync.ts` |
| WhatsApp (Embedded Signup, Cloud API sends, 24-hour window) | Code live; blocked on Meta business verification | `src/lib/meta/whatsapp.ts` |
| Stripe | Daythread's **own** subscription billing only (`Business.planTier`). No customer-facing Stripe connection; the `Payment` model exists but nothing writes to it | `src/lib/subscriptionBilling.ts`, `src/app/api/webhooks/stripe/route.ts` |
| OAuth state (signed JWT, httpOnly nonce cookie, single use, 10 min, bound to provider + purpose) | Live, generic | `src/lib/integrations/oauthState.ts` |
| Token encryption at rest (AES-256-GCM Prisma extension, key rotation) | Live, generic for every `Integration` row | `src/lib/db.ts`, `src/lib/tokenCrypto.ts` |
| Plan quota gate (`activateIntegration`, row-locked, the only path to CONNECTED) | Live | `src/server/integrationQuota.ts` |
| Webhook dedupe (`WebhookEvent` unique on provider + event id) | Live for Stripe only | `prisma/schema.prisma` |
| Failure reporting (`OpsEvent`), founder dashboard (`FOUNDER_EMAILS`) | Live | `src/lib/observe.ts`, `src/app/admin/growth` |
| Audit log model | Exists; written for bookings, invitations, join requests, not for integrations | `AuditLog` |
| Notifications (in-app + Expo push) | Live for new message / new lead / website inquiry / failed subscription payment | `src/server/leadIngestion.ts`, `src/server/push.ts` |
| Settings → Channels hub | Live; two hard-coded groups (Channels, Calendar), pill states derived on the server | `src/app/dashboard/settings/IntegrationsHub.tsx` |

Not present anywhere: Google Drive, Dropbox, Slack, Microsoft (Outlook or Calendar),
Calendly, a Stripe connection for the business's own account, an access-request /
approval flow, provider maturity flags, webhook retry or dead-letter, integration audit
entries, a notification when a connection needs attention.

## Plan

1. **Schema (additive only).** New `IntegrationProvider` values `MICROSOFT_OUTLOOK`,
   `MICROSOFT_CALENDAR`, `CALENDLY`, `SLACK`, `GOOGLE_DRIVE`, `DROPBOX`. New model
   `IntegrationAccessRequest` (business, provider, requester, status PENDING / APPROVED /
   REJECTED / REVOKED, note, reviewer, timestamps; unique per business + provider).
   `WebhookEvent` gains `status`, `attempts`, `lastError`, `payload`, `businessId`,
   `processedAt` so a failed delivery is kept and retried instead of dropped.
   `Client.externalFolders` (JSON) for Drive / Dropbox folder references. Applied to
   production with `prisma migrate diff` → reviewed SQL → `db execute`; no drops.
2. **Shared OAuth runner.** `src/lib/integrations/oauth.ts` describes each OAuth
   provider (authorize URL, token exchange, refresh, revoke, identity, PKCE when the
   provider requires it). `src/server/oauthConnect.ts` runs the common callback:
   verify state → session and tenant binding → encryption check → exchange → identity →
   `activateIntegration` (revoke the fresh grant if the plan refuses) → audit entry →
   redirect. Each provider's callback route is a few lines on top of it. `oauthState.ts`
   learns the new provider names and carries a PKCE verifier in the nonce cookie.
3. **Providers.**
   - Google Drive: same Google client, `drive.file` scope, purpose `drive`. One
     "Daythread" folder per connection, a folder per client on demand, file list on the
     client page. Requires the Drive API enabled on the Google Cloud project.
   - Dropbox: OAuth 2 with PKCE and refresh tokens; same folder-per-client feature.
   - Slack: OAuth v2 bot token, channel chosen at install; new lead, new booking and
     "connection needs attention" notices posted through `chat.postMessage`. Titles
     only, never a customer's message body.
   - Microsoft: one Entra app, `common` tenant. Outlook mail = inbox delta sync into
     `ingestInboundMessage` + `sendMail` in `deliverToCustomer`. Calendar = third
     provider inside `calendarSync` (delta pull, mirror create/update/cancel) with the
     booking id kept in an open extension so a mirror never blocks itself.
   - Calendly: OAuth 2; scheduled events imported as bookings (invitee = client) by
     polling on reconcile and cron, plus a signed webhook (`invitee.created` /
     `invitee.canceled`) when the account's plan allows webhooks.
   - Stripe (business account): Stripe Connect OAuth for Standard accounts. Stores the
     connected account id, a separate Connect webhook endpoint records successful
     payments as `Payment` rows against the matching client. Requires Connect enabled on
     Daythread's Stripe account and `STRIPE_CONNECT_CLIENT_ID` + `STRIPE_CONNECT_WEBHOOK_SECRET`.
   - Twilio SMS: unchanged; `TWILIO_PHONE_NUMBER` accepted as an alias of `TWILIO_FROM_NUMBER`.
   - Daythread Forms: unchanged (always on), listed under Business.
   - Instagram: invite-only beta. `INTEGRATION_INSTAGRAM_MODE=invite|open|off` (default
     invite). Request access → founder approves in `/admin/growth` → Connect appears.
     Meta's own requirements are unchanged and still shown.
   - WhatsApp: `INTEGRATION_WHATSAPP_MODE=coming_soon|open` (default coming soon). The
     card says so; no Connect button; the real flow stays for when Meta approves.
4. **Webhook inbox.** `src/server/webhookInbox.ts`: claim (dedupe), complete, fail
   (keep payload + error, count attempts), retry from the daily cron up to a cap, then
   dead-letter shown on the founder dashboard. Stripe, Stripe Connect and Calendly
   adopt it; Meta and Twilio keep their existing provider-id dedupe and gain failure
   recording.
5. **Dashboard.** Registry gains `group` (Communication / Scheduling / Payments / Files /
   Business), `maturity` (ga / beta / coming_soon), and ordering; the hub renders from
   the registry. Pills: Connected, Available, Beta, Coming soon, Needs attention, Sync
   issue, Configuration required (owners only). Existing card design, no emojis.
6. **Cross-cutting.** `notifyBusiness` fan-out (in-app + push + Slack), a notification
   when maintenance flags a connection, `AuditLog` entries for connect / disconnect /
   access decisions, rate limits on connect and access-request actions, environment
   table and per-provider docs.
7. **Verification.** Vitest against the real database for every state machine, signature
   check and tenant boundary with providers stubbed by URL; typecheck, lint, clean-checkout
   build with a bundle secret scan; dev UI inspection; production deploy and direct checks.
   Anything that cannot complete without credentials this deployment lacks is reported as
   exactly that.
