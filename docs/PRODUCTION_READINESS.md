# Daythread — production readiness

Last verified: 2026-09-06 · main `532c6da` · https://daythread.org

A feature is listed under VERIFIED only when it was exercised end to end — in a browser
against the deployed site, or with automated tests against the real database and, where a
provider is involved, the real provider. "Recorded responses" means the provider's HTTP
replies were scripted from its documented format; that proves Daythread's side, not the
provider's.

## 1. VERIFIED

- Authentication: signup, login, logout, wrong-credential handling, 8-failure lockout, session
  tokens carrying no role or plan, middleware redirects for anonymous and forged sessions
  (tests + browser).
- Tenant isolation: conversations, bookings, integrations, automations, agent proposals,
  webhooks — every action re-derives the business from the session and refuses foreign ids
  (tests).
- Plan enforcement, server-side: connected-channels quota (Free 2 / Pro ∞ / Business ∞)
  in a row-locked transaction at every activation point, including 6 simultaneous attempts;
  automation caps at creation, toggle and run time; seat caps; assistant daily and hourly caps
  counted in the database; the assistant's proposals denied to Free, team features denied to
  Free/Pro through actions and the mobile API (tests + browser on staged Free/Pro workspaces).
- Bookings: 5 concurrent public bookings for one slot → exactly one; outside hours, overlap
  and past times refused; reschedule respects other bookings and connected-calendar busy
  time; cancel frees the slot and removes calendar mirrors (tests).
- Inbox: inbound routing per channel, dedupe by provider message id, identity matching
  inside one business only, honest delivery states (NOT_DELIVERED when a channel isn't
  connected; never "sent" without provider confirmation) (tests + browser).
- Assistant: proposals from real data; Recommendation → Preview → Approve → Execute;
  execution recorded honestly; dismiss; hourly cap (tests + browser).
- Automations: create from recipes, edit, delete, Free fourth saved switched off, runner
  respects the cap; a copy of an existing automation is refused; the runner claims one
  execution per action and person under a database lock, so the same event arriving five
  times at once sends once (tests + browser).
- Concurrency (src/server/concurrency.test.ts): five simultaneous automation fires, five
  reschedules into one slot, five teammate invitations at the seat cap, five deliveries of one
  inbound message — each leaves exactly one outcome. Locks: `withLock` (Postgres advisory
  lock) in src/lib/dbLock.ts plus the Business row lock for bookings.
- Calendar: day agenda, week time grid (working hours, bookings, external busy time, now
  line) and month, all in the business timezone (browser).
- Production deployment and read-only smoke of every dashboard page, public booking page,
  support, privacy, terms, sitemap, manifest at 390 and 1440 (browser).
- Responsive: no horizontal overflow at 375 / 390 / 430 / 1280 / 1440 / 1728 across all
  signed-in pages and the auth pages (headless Chrome emulation).

## 2. CODE COMPLETE — EXTERNAL CONFIG REQUIRED

| Area | What exists | What's missing |
|---|---|---|
| Google Calendar + Gmail | OAuth start, callback, calendar picker, sync, mirrors, busy time, revoke, reconnect; tests with recorded Google responses | Google Cloud OAuth verification for Gmail (restricted) + Calendar (sensitive) scopes; a real account round trip |
| Apple Calendar | app-specific-password flow, CalDAV discovery, selection, sync, mirrors; live iCloud reached from production (wrong password rejected correctly) | a real Apple ID round trip |
| Instagram | Login, callback, encryption, webhook, sends, token refresh; full security matrix tested | `INSTAGRAM_APP_ID/SECRET`, `META_WEBHOOK_VERIFY_TOKEN`; App Review |
| WhatsApp | Embedded Signup, WABA/phone association, webhook, 24h window, statuses | `META_APP_ID/SECRET`, `WHATSAPP_CONFIG_ID`; Business verification |
| SMS | number search/claim/release, inbound + status webhooks with signature checks | `TWILIO_ACCOUNT_SID/AUTH_TOKEN` |
| Product email | Resend adapter, inbound webhook, honest NOT_DELIVERED | `RESEND_*` (see docs/email/PRODUCTION.md) |
| AI text | OpenAI when configured; deterministic fallbacks otherwise | `OPENAI_API_KEY` |
| Stripe | checkout, portal, webhook, proration, cancellation, failed payment, wallet-ready Checkout | intentionally **not activated** (`STRIPE_*` unset) |

## 3. REQUIRES MY MANUAL ACTION

See the "MANUAL ACTIONS" section of the session report; each item names the dashboard,
setting, URL and variable.

## 4. BLOCKED

- Real Google Calendar round trip: needs a Google account signing in on the live consent
  screen (the consent screen now loads correctly on production).
- Real Apple Calendar round trip: needs an Apple ID and app-specific password.
- Real Meta flows: no Meta app configured.
- Real device testing: no iPhone reachable from this environment; viewport emulation only.
- Native iOS build: no Xcode on this machine.

## 5. KNOWN LIMITATIONS

- Password reset by email is refused in production until Resend is configured (previously
  the link was shown on screen — fixed, see SECURITY).
- Staff bookings created from a lead thread use the same availability check but not the
  row lock (that file carries unrelated uncommitted work); public bookings and reschedules
  are locked.
- Per-instance rate limits (login, signup, booking) are process-local; the product caps
  (assistant questions, proposals) are database-counted.
- Onboarding wizard file carries unrelated uncommitted edits and was not changed in this pass.

## 6. TEST RESULTS

- Automated: 225 tests, 34 files, all passing (vitest, real Postgres)
- Typecheck: clean
- Lint: clean
- Production build: passes on Vercel (this deploy) and locally
- Browser QA: dev at 375/390/430/1280/1440/1728, production read-only at 390/1440; lifecycle drive (public booking → automation-opened conversation → reply → reschedule → cancel) passed on a phone viewport

## 7. SECURITY RESULTS

Final launch audit additions (2026-09-06):
- Fixed: `JWT_SECRET` no longer falls back to a public placeholder in production; a missing
  value throws at first use (sessions, middleware, Google state).
- Fixed: sessions are versioned. Password reset and password change bump the version, so
  every previously issued token — cookie or mobile bearer — is refused.
- Added: change password (current password required) in Settings → Profile.
- Fixed: the build no longer passes `--accept-data-loss` to Prisma; a destructive schema
  change fails the build instead of dropping data.
- Fixed: framing is refused everywhere except the embeddable lead form (`/embed/:handle`).
- Added: webhook body ceilings (Stripe 512KB, Twilio 64KB, Resend 2MB) → 413 before parsing.
- Added: AI prompts mark customer text as untrusted and forbid claiming actions; assistant
  questions are capped at 500 characters; model calls time out at 20s with one retry.
- Fixed: the "simulate inbound message" tool is refused for real workspaces on production.

- Fixed: production password-reset link disclosure (account takeover) — `src/app/actions/auth.ts`.
- Fixed: public booking race (two customers could take one slot) — row-locked transaction.
- Verified by tests: OAuth state replay/expiry/forgery/wrong session/wrong tenant for
  Google, Instagram, WhatsApp; webhook signature, duplicate and malformed handling for
  Stripe, Meta, Twilio; encryption at rest for every stored credential; cross-tenant
  reschedule/cancel/edit/delete refused; quota bypass via direct calls and concurrency
  refused; agent denied to Free/Pro via action and API.
- Greps: no secrets in source, no `console.log` outside labeled demo adapters, no
  localhost or stale Vercel hostnames in code, no TODOs.

## 8. DEPLOYMENT NOTES

- Deploy from a clean detached worktree of `origin/main` with the Vercel CLI, then alias
  `daythread-app.vercel.app` (redirects to daythread.org). Never deploy the working tree:
  it carries another session's uncommitted edits.
- Production env present: `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `JWT_SECRET`,
  `INTEGRATION_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `SEED_SECRET`, `GOOGLE_CLIENT_ID/SECRET`.
- Missing (optional until launch of that feature): `OPENAI_API_KEY`, `RESEND_*`,
  `INSTAGRAM_*`, `META_*`, `WHATSAPP_CONFIG_ID`, `TWILIO_*`, `STRIPE_*`.
- Daily cron `/api/cron/automations` (automations + integration maintenance) runs at 13:00 UTC.
