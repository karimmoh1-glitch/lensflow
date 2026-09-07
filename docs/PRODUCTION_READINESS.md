# Daythread — production readiness

Last verified: 2026-09-06 · unified-inbox pivot · https://daythread.org

Daythread is a unified customer inbox. The product surface is Inbox + Settings (Channels,
Profile, Security, Subscription, Team). Bookings, calendars, customer payments, automations,
the Business Agent, analytics, CRM pipelines and lead scoring were removed from the product
in the pivot; the only payment anywhere is the Daythread Pro subscription.

A feature is listed under VERIFIED only when it was exercised end to end — in a browser
against a running build, or with automated tests against the real database and, where a
provider is involved, recorded provider responses.

## 1. VERIFIED

- Signup is individual (name, email, password) and creates a personal inbox; onboarding is
  welcome → connect a first channel → inbox, skippable at both steps (browser, 1440 and 390).
- Inbox: every channel in one list, newest first with people waiting on you lifted first;
  search across names, handles, subjects and message text; channel and state filters in the
  URL; Priority / All views with classification; thread panel with who they are, what they
  mentioned (read from their words), a summary, previous conversations; reply with honest
  delivery states (NOT_DELIVERED when a channel isn't connected); mark read/unread; delete
  for me with undo; reclassify with a remembered sender rule (browser + tests).
- Team (Pro): invite by email, accept from the link, teammate lands in the shared inbox with
  Inbox-only navigation and is redirected away from Settings; assignment from the thread
  header; seats enforced at invite and accept time (browser + tests).
- Plan enforcement, server-side: connected-channels quota (Free 2 / Pro unlimited) in a
  row-locked transaction at every activation point, including simultaneous attempts; team
  invites and assignment refused on Free; AI drafts refused on Free (tests).
- Security carried over unchanged: signed single-use OAuth state, tenant binding on every
  callback, AES-256-GCM credential encryption, webhook signature verification and
  idempotency, versioned sessions, rate limits, bounded webhook bodies, CSP/HSTS (tests).
- Removed routes answer 404: /dashboard/{bookings,calendar,payments,automations,agent,
  analytics,clients,copilot,team}, /book, /pay, /portal, /partner. /dashboard and
  /onboarding (once complete) redirect to /dashboard/inbox; /dashboard/billing redirects to
  Settings → Subscription carrying Stripe's return query (browser).
- Responsive: no horizontal overflow and no runtime exceptions at 375 / 390 / 430 / 768 /
  1024 / 1280 / 1440 / 1728 across the landing page, auth pages, onboarding, inbox, thread
  and every Settings tab (headless Chrome emulation). Reduced motion respected.

## 2. CODE COMPLETE — EXTERNAL CONFIG REQUIRED

| Channel | What exists | What's missing |
|---|---|---|
| Gmail | OAuth start, callback, encryption, sync, reply, revoke, reconnect; tests with recorded Google responses | Google Cloud OAuth verification for Gmail (restricted) scopes; a real account round trip |
| Instagram | Login, callback, encryption, webhook, sends, token refresh; full security matrix tested | `INSTAGRAM_APP_ID/SECRET`, `META_WEBHOOK_VERIFY_TOKEN`; App Review |
| WhatsApp | Embedded Signup, WABA/phone association, webhook, 24h window, statuses | `META_APP_ID/SECRET`, `WHATSAPP_CONFIG_ID`; Business verification |
| SMS (Pro) | number search/claim/release, inbound + status webhooks with signature checks | `TWILIO_ACCOUNT_SID/AUTH_TOKEN` |
| Contact form | /embed/[handle] → inbox, rate limited | none |
| Product email | Resend adapter, inbound webhook, honest NOT_DELIVERED | `RESEND_*` (see docs/email/PRODUCTION.md) |
| AI text (Pro) | OpenAI when configured; deterministic fallbacks otherwise | `OPENAI_API_KEY` |
| Subscription | Stripe Checkout, portal, webhook, proration, cancellation, failed payment — Pro only | `STRIPE_*` (unset: plans shown for reference, nothing charged) |

## 3. RETAINED BUT HIDDEN

Database models for bookings, payments, services, availability, automations, calendar
events and lead extraction remain in the Prisma schema so that no destructive migration runs
against production and older rows stay intact. Nothing in the product reads or writes them
except the internal demo seed (`/api/admin/seed`, secret-gated) and the Stripe webhook's
subscription handling. `BUSINESS` stays in the plan enum as a hidden alias of Pro for any
existing subscription.

## 4. KNOWN GAPS

- Per-instance rate limits (login, signup, contact form) are process-local; the plan quotas
  and caps are database-counted.
- Lead extraction still runs at ingestion (service/date/location/budget from the person's
  words) to power "They mentioned"; scoring is gone.
- The daily cron path is still `/api/cron/automations`; it now runs channel maintenance only.
