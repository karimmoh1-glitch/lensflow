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

## Trust pass (2026-09-07, PR #47)

- Contrast: muted text is ink/65 and ink/70 (≥4.5:1 on white and on the paper background);
  white text sits on `accent-strong` (#CF3F3A, 4.7:1). Verified by a rendered sweep of every
  visible text node and by axe-core on the public pages and the dashboard at 1440 and 390.
- axe-core (WCAG 2.1 AA + best practice): no violations on /, /login, /signup, /status,
  /support, /privacy, /terms, or the dashboard at 1440; one best-practice note remains on
  phones (content outside a landmark). Pinch-zoom is no longer disabled in the app.
- Continue with Google (login + signup) on the existing OAuth client and callback; verified-
  email linking; new users get a workspace; concurrent first sign-ins serialized (tests).
- Annual billing: yearly Stripe prices by lookup key at ten months' price; the webhook maps
  monthly and yearly keys to the same plan.
- Landing: who-it's-for + honest proof placeholder (no invented customers), FAQ, JSON-LD
  (Organization, SoftwareApplication with the three real offers, FAQPage). /status page with
  a live database check and configured/not-configured per provider; providers are never
  claimed operational. /demo removed from the sitemap; the only contact addresses are
  support@daythread.org and privacy@daythread.org. Privacy has a cookies section.
- Inbox with 300+ conversations renders in ~370 ms on dev; search and filters stay fast;
  an 80-character name and a 2,000-character message truncate and wrap cleanly on a phone.

## Launch war room (2026-09-07, PR #50)

- 7-day Pro trial with a card on file, one per business, offered and decided server-side;
  the subscription panel states the first-charge date and how to cancel; the landing pricing
  shows the trial terms only when billing is live on the deployment (tests: webhook trial sync,
  eligibility).
- Settings is a control center: a sidebar of sections on desktop, all visible without scrolling;
  a section index on phones with a way back. Verified by keyboard: every section reachable
  with Tab/Enter, sidebar fully in view at 1440×900.
- Keyboard audit (real key events): landing tab order with visible rings, FAQ opens with
  Enter/Space, login submits with Enter, ⌘K opens the palette, arrows move the selection,
  Escape closes it, Enter opens a conversation, the composer is reachable, the phone "More"
  sheet traps focus and restores it on Escape. Fixed: palette now restores focus on close.

## Conversion war room (2026-09-07, PR #53)

- Plan shape: Free (2 channels, 1 person) · Pro $20 (every channel, text number, AI, assistant,
  unlimited automations, up to 5 people with assignment) · Business $50 (business-wide view,
  60 assistant actions/hour, business memory, up to 10 people with roles and notes, priority
  support). Team is a Pro capability now; tests updated.
- Contextual paywall (`src/components/Paywall.tsx`, copy in `src/lib/paywall.ts`): one dialog
  keyed on the feature reached for (channels, sms, ai_draft, ai_summary, assistant, automations,
  team, intelligence), price and interval on it, the trial's first-charge date when the
  workspace still has the trial, one CTA, "Not now", Escape closes. Wired into the assistant
  page, team tab, channel cards at the limit, the composer's AI draft, the summary card, the
  automation toggle and every inline entitlement notice. Events: paywall_shown / paywall_cta /
  paywall_dismissed with feature + source + plan; checkout_started carries the source.
  Verified as a Free user with real clicks: assistant, team, draft, channels-at-limit.
- Landing: "Why Daythread" (the cost of the scattered way, one message becoming a booking /
  automation / proposal / assignment), Trust (six things the code actually does), hero note
  that the example studio is one cast. FAQ extended: trial end, cancel, delete, AI scope,
  without AI. Pricing carries the plan philosophy lines.
- Status page adds the assistant model and email sending rows.

## Final conversion pass (2026-09-07, PRs #54–#55)

- The opening animation writes no invented readings (name, time, action): thread, message,
  word. FAQ answers the skeptical buyer (who it's for; HoneyBook/Dubsado; Front or a shared
  inbox; the separate tools; changing email or number; when you're charged; downgrading)
  without claims about what other products lack. "Why Daythread" carries the honest cost
  line: one missed booking can cost more than a month of Daythread.
- Process note: a CSS cleanup in #54 left a stray brace; the ship chain was stopped, the two
  deployments it had queued were removed before going live (production stayed on #53), and
  #55 shipped the fix with the build gated on its real exit code.

## Launch readiness pass (2026-09-07, PR #57)

- Funnel instrumentation completed (docs/ANALYTICS.md): landing_view / landing_cta with a
  per-visit random id (no cookie, no IP), signup_started, workspace_created,
  first_channel_connected, first_ai_action (draft or agent approval), first_automation_created,
  trial_started, plus the existing first_message_received / first_reply_sent /
  first_booking_created / paywall_* / checkout_started / subscription_* events. Read-only SQL
  for every funnel question is in the doc.
- Demo seed schedules its bookings at believable hours in the demo business's timezone.

## Personalized onboarding (2026-09-07, PR #58)

"Start free" now opens `/start`: ten short questions about how the person works (what they do, the kind of work, business status, channels, pain points, what they want from Daythread, current tools, bookings, team, team size when relevant), a summary that reflects the answers back with a plan recommendation and the reasons for it, then the account step (password or Google). `/signup` redirects there; the account step is the same `signup()` action and the same Google sign-in, unchanged.

What the answers change, all deterministic (`src/lib/personalization.ts`, 12 unit tests plus persona tests A–D):
- the recommendation: Business when more than five people are involved; Pro when they named something only Pro has (more than two connections, SMS, AI, a team of up to five); Free otherwise and always for personal use;
- `Business.priorities`, the two to four features Today leads with;
- the channels they named, marked `wanted` on their Integration rows, which the shell banner, the onboarding connect step, the inbox empty state and Settings → Channels all point at;
- the stored recommendation, repeated on Settings → Subscription while their plan is below it;
- the paywall headline and lede, built only from what they selected;
- the bookings, automations and assistant pages' first-run copy.

Nothing is connected, charged or invented. "Building your Daythread" lists exactly the four writes above. The answers are editable under Settings → Profile → How you work, and re-saving re-derives everything. Answers are option keys; the only free text is an optional 80-character description for "Other" work. They are not passed to the language model.

Verified on dev with real clicks (persona A–D, widths 375/390/768/1440/1728): every question, Back, Continue, refresh mid-flow (position and answers restored), browser back/forward, keyboard selection, duplicate email, short password, skip, the building moment, the personalized welcome, the connect order, the inbox/Today/bookings/automations/assistant surfaces, the personalized paywall, the subscription note and the settings form. Google sign-in with answers is covered by the cookie hand-off (`dt_start`, 30 minutes, scoped to the callback path) and cannot be exercised end to end without a Google OAuth client on the deployment.

## First-revenue / activation sprint (2026-09-07, PR #59)

- **Needs attention** (`src/lib/attention.ts`, `src/server/attention.ts`): deterministic, explainable rules — waiting for your reply (their message is the last word), follow-up due (a reminder the owner set), follow up (your reply unanswered for 3 days, no booking coming, no reminder planned), confirm booking (unconfirmed within 3 days). Booked, lost, cold, archived and non-person threads never surface. Today lists them with the reason; the inbox row shows the follow-up label; the thread rail shows the reason and the follow-up control. 13 rule tests + a database test with a second tenant.
- **Follow-ups**: `Lead.followUpAt` and `setFollowUp()`; an inbound message clears it. Events `first_followup_created`, `followup_created`, `followup_cleared`.
- **Referrals**: `Business.referralCode` / `referredById`; `?ref=` on the landing page is kept in the browser and attributed at signup (password, Google via the start cookie). Milestones `referral_activated` (first channel) and `referral_converted` (first paid subscription), once each. Link under Settings → Profile for owners.
- **Founder dashboard** `/admin/growth` behind `FOUNDER_EMAILS` (404 otherwise; `/admin` is session-protected in middleware).
- **Vertical pages** `/photographers` and `/service-businesses`: real differentiated copy, honest standing, FAQ JSON-LD, in the sitemap and footer. The "people are made up" line is gone from the hero.
- **Inbox**: `first_conversation_viewed` recorded once per workspace.
- **Gmail sync** now lives in `src/server/gmailSync.ts`: the inbox and Today pull on open (not only after the first 20-second tick), the "Check for new emails" button uses the same path, and the daily cron pulls every connected Gmail so follow-ups and reminders see mail from workspaces nobody opened. Vercel's cron runs once a day; more frequent background pulls need a paid cron schedule or Gmail push (Pub/Sub), neither configured.
- **Workspace deletion** cancels an active Stripe subscription first and refuses to delete if Stripe can't be reached, so a deleted workspace can never keep being billed.

## Final pre-customer audit (2026-09-07, PR #60)

- **Blocker fixed:** the time-based automations (reminders before a booking, follow-ups after, quiet-lead nudges) had no caller in production; the daily cron now runs `runScheduledAutomations()` after the Gmail pull and before channel maintenance. The Gmail pull is bounded to a time budget so the run fits Vercel's 60-second cron limit; what doesn't fit is first in line next day.
- **Production configuration, verified from the deployment:** database, sessions, token encryption, cron secret, seed secret, app URL and the Google OAuth client are configured. Google's consent screen accepts the production redirect URI with identity-only scopes (checked live). Not configured: Meta (Instagram, WhatsApp), Twilio, OpenAI, Resend, Stripe, `FOUNDER_EMAILS`. The app says so wherever each would be offered.
- **Security smoke on production:** mobile API 401 without a session and with a forged bearer; admin routes 401 without and with a wrong secret; cron 401; every webhook 501 while its provider is unconfigured; forged OAuth state ends on the settings page with `connect_error=state`; `/login?next=` is ignored; HSTS, CSP, frame, nosniff, referrer and permissions headers present.
- **Privacy:** states when and why conversation text would go to OpenAI, and that without a model nothing leaves Daythread.
- **Mobile:** every dashboard section at 375 and 390 without overflow; onboarding at 390 with reload, back and forward; keyboard audit passing.
