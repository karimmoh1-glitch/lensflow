# How messages reach the inbox, and how the inbox stays current

One pipeline for every channel, in `src/server/leadIngestion.ts`:

```
provider event → verify (signature / OAuth-bound state) → parse → resolve the owning
Integration by the provider's account id → normalize → ingestInboundMessage
→ dedupe on the provider message id (lock + database unique) → classify
→ Client / Conversation / Lead / Message in one path → inbox version bump
→ live stream → browser refresh
```

## Normal path: push

| Channel | How a message arrives | Verified by |
|---|---|---|
| Instagram, WhatsApp | Meta webhook `POST /api/webhooks/meta` | `X-Hub-Signature-256` with the app secret; body-hash dedupe in `WebhookEvent` |
| SMS | Twilio webhook `POST /api/webhooks/twilio/sms` | `X-Twilio-Signature` with the auth token |
| Email (Resend inbound) | `POST /api/webhooks/email` | Svix signature |
| Gmail | **pull only** (Gmail push would need a Google Cloud Pub/Sub topic) | OAuth |

## Keeping the browser current

`Business.inboxVersion` is bumped by a Prisma extension on **every** Message create or update
(`src/lib/db.ts`), so an ingestion, an outbound send, a delivery receipt or an automation all
move it without any call site having to remember.

Each open dashboard tab holds one server-sent-events stream (`GET /api/inbox/events`,
cookie session, `src/app/dashboard/InboxLive.tsx`). The server reads the one indexed row
every 2.5 s for up to 45 s, emits `version` when it changes, and ends; the browser reconnects
on its own. The client refreshes the page (React Server Components refresh — client state such
as a draft survives), coalesces bursts, closes the stream while the tab is hidden, and
reopens with a catch-up refresh on visibility, focus or network return. No provider is ever
polled by the browser.

## Repair path: reconciliation

"Check for messages" (inbox header, and the app's pull-to-refresh) runs
`reconcileBusiness` (`src/server/reconcile.ts`): every connected pull-capable channel, each
idempotent and throttled to once per 30 s per connection.

- **Gmail** (`src/server/gmailSync.ts`): incremental by Gmail's history id stored in
  `Integration.syncCursor`; when Gmail no longer has that history, a time window since the
  last sync with a day of overlap. The cursor is refreshed after every run.
- **Instagram** (`src/server/instagramSync.ts`): the recent conversations from the Graph
  API, ingesting customer messages newer than the last sync (a day of overlap), idempotent
  on Meta's message id. A dead token flips the connection to "reconnect".
- **WhatsApp, SMS**: push-only providers; nothing to pull.

A background fallback (`AutoGmailSync`, despite the name it runs the same reconciliation)
runs every two minutes while a tab is visible, for Gmail which has no push. The daily cron
also reconciles Instagram and checks that Meta's `messages` subscription is still active,
re-subscribing once and recording the outcome on the row.

## Guarantees

- **Idempotent**: `Message @@unique([conversationId, providerMessageId])` — a redelivery or a
  concurrent duplicate is refused by the database, and the application treats P2002 as
  "already stored".
- **Tenant-bound**: ownership comes from the Integration row holding the provider account
  id (Instagram account id, WhatsApp phone number id, the business's Twilio number), never
  from anything in the payload a sender controls.
- **Honest state**: `Integration.lastWebhookAt` (last verified provider event),
  `lastSyncedAt` / `lastSyncStatus` / `lastError`, `settings.webhooksSubscribed` for
  Instagram, `tokenExpiresAt`. Shown on the channel card ("Last message received…") and in the
  founder dashboard's workspace detail.
- **Statuses never move backwards**: WhatsApp and Twilio receipts apply in rank order.
