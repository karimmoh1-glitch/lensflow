# Meta: Instagram and WhatsApp

This file separates three different things, because conflating them is how "it's done" turns
out to mean "it isn't":

- **DAYTHREAD CODE** — built and in the repository. Verified by tests and typecheck.
- **META DASHBOARD CONFIGURATION** — a human with access to the Meta app has to do it. No
  code can.
- **META APPROVAL** — Meta decides, on Meta's timeline. Nothing here can shorten it.

Nothing in Daythread pretends a connection exists. Until the variables below are set the
Integrations page says "Configuration required" and the Connect button is not offered; until
a business completes Meta's own authorization its card says "Available", never "Connected".

---

## 1. DAYTHREAD CODE — what is built

| Piece | Where |
|---|---|
| One Meta configuration layer (states, redirect URIs, webhook URL, validation) | `src/lib/meta/config.ts` |
| Instagram Login start (signed state, plan quota checked before Meta is contacted) | `src/app/actions/connect.ts` → `connectInstagram` |
| Instagram callback: state → session → membership → code → long-lived token → profile → granted scopes → webhook subscription → first DM pull | `src/app/api/auth/instagram/callback/route.ts` |
| Instagram 60-day token refresh, and flagging a token that can no longer be refreshed | `src/server/integrationMaintenance.ts` (daily cron) |
| WhatsApp Embedded Signup start | `connectWhatsApp` |
| WhatsApp callback: code → business token → WABAs from `debug_token` → phone numbers → webhook subscription | `src/app/api/auth/whatsapp/callback/route.ts` |
| Switching between the numbers Meta granted, re-verified with Meta on every switch | `selectWhatsAppNumber` in `src/app/actions/connect.ts` |
| One webhook for both products: handshake, HMAC, idempotency, tenant routing, unknown-account handling, per-IP brake on forged signatures | `src/app/api/webhooks/meta/route.ts` |
| Inbound normalization (Instagram DMs, WhatsApp text/media/location/interactive), delivery, read and failure receipts | `src/server/metaInbound.ts` |
| Sending: Instagram DM, WhatsApp text inside the 24-hour window; provider id stored; nothing marked SENT before Meta accepts it | `src/server/deliver.ts` |
| Honest message states in the thread (Sent / Delivered / Read / Not delivered + reason / Failed + reason) | `src/lib/messageStatus.ts` |
| Disconnect: unsubscribes Meta's webhooks, erases credentials, releases the plan slot, keeps history | `disconnectIntegration` |
| Operator view of the deployment's Meta configuration — states only, never values | `src/app/dashboard/settings/MetaConfigPanel.tsx` |
| Template API surface (list, send) with the feature reported as off | `src/lib/meta/whatsapp.ts` |

Credentials are encrypted at rest with AES-256-GCM (`src/lib/tokenCrypto.ts`, applied to every
`prisma.integration.*` call by a client extension) and never leave the server. No access
token, refresh token, app secret or verify token is ever placed in a URL, a redirect, a
rendered page, a log line or an error message shown to a user.

### Environment variables

| Variable | Product | What it is |
|---|---|---|
| `INSTAGRAM_APP_ID` | Instagram | The **Instagram** app id (not the Facebook app id) |
| `INSTAGRAM_APP_SECRET` | Instagram | The Instagram app secret |
| `META_APP_ID` | WhatsApp | The Meta app id |
| `META_APP_SECRET` | WhatsApp + webhook | The Meta app secret |
| `WHATSAPP_CONFIG_ID` | WhatsApp | The Embedded Signup configuration id |
| `META_WEBHOOK_VERIFY_TOKEN` | Both | Any long random string you also paste into Meta |
| `NEXT_PUBLIC_APP_URL` | Both | The public https origin; every redirect URI and the webhook URL are built from it |
| `INTEGRATION_TOKEN_ENCRYPTION_KEY` | Both | Required in production, or connecting is refused |

Instagram needs the first two plus the verify token and app URL. WhatsApp needs
`META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_CONFIG_ID` plus the verify token and app URL.
Set only what you use — Instagram works without any WhatsApp variable, and vice versa.

`NEXT_PUBLIC_APP_URL` is reported **invalid** in production when it is `http`, `localhost`, or
a `*.vercel.app` preview URL, because Meta would either refuse it or lose it on the next
deploy. Fix it before configuring anything in the Meta dashboard.

### What is covered by automated tests

Meta itself is replaced by recorded responses in every test below — they are **simulated**,
and are labelled that way because they prove Daythread's half of the contract, not Meta's.

| Area | Test file | Cases |
|---|---|---|
| Webhook signature + Graph client | `src/lib/meta/common.test.ts` | valid signature, one-byte body change, another app's secret, right-length non-hex forgery (a clean `false`, never a throw), wrong length/prefix, unicode bodies, constant-time token compare, Meta error envelopes, provider 500, unreadable 200, timeout, unreachable host, credential scrubbing |
| Configuration layer | `src/lib/meta/config.test.ts` | ready only when complete, malformed secret reported invalid, no value ever in the report, localhost / preview / http app URLs refused in production, webhook readiness separate from product readiness, the five connection states |
| Authorization URLs + window | `src/lib/meta/authUrls.test.ts` | scopes and config id present, no secret in any URL, redirect built from the configured origin, professional-account rule, 24-hour window boundaries, templates reported off |
| Instagram callback | `src/app/api/auth/instagram/callback/route.test.ts` | end-to-end connect (long-lived token encrypted at rest, profile, webhook subscription, first DMs ingested), replayed state, forged state, expired state, wrong session, wrong tenant, personal account refused, account already connected elsewhere, plan quota, canceled authorization |
| WhatsApp callback | `src/app/api/auth/whatsapp/callback/route.test.ts` | end-to-end connect (WABA + phone association, webhook subscription, encryption), replay, expiry, wrong tenant, no WABA, no phone, number already connected elsewhere |
| Webhook route | `src/app/api/webhooks/meta/route.test.ts` | handshake (right/wrong token, wrong mode, no challenge), forged and non-hex signatures, tampered body, WhatsApp event signed only by the Instagram secret, oversized payload, malformed shapes, duplicate delivery, unknown account, disconnected integration, echoes, delivery/read/failed receipts, no status downgrade, media normalization, both Instagram payload shapes, per-IP brake on forgery |
| Outbound delivery | `src/server/metaDelivery.test.ts` | not connected, real send with provider id, 200 without an id, revoked token flips to reconnect, provider outage does not, window closed before the network, Meta's own 131047, cross-tenant impossible, unreadable credential |
| Disconnect / reconnect | `src/server/metaDelivery.test.ts` | credential erased, slot released, history preserved, Meta refusing the unsubscribe, reconnect reuses one row, another workspace untouched |
| Connection start (bypass attempts) | `src/app/actions/metaConnectQuota.test.ts` | Free at its limit refused before Meta is contacted, free slot proceeds with no secret in the URL, reconnect re-uses its own slot, unconfigured deployment refuses, non-admin refused |
| Message states | `src/lib/messageStatus.test.ts` | sent / delivered / read from real receipts, the window reason, reconnect reason, Meta's 131047 read back |
| Quota | `src/server/integrationQuota.test.ts` | Free / Pro / Business sequences, concurrency, per-workspace scoping, downgrade |
| Identity | `src/server/identity.test.ts` | one person joined across email / phone / Instagram, inside one business only |

Not covered, because it needs a real Meta app: the live consent screens, real webhook
deliveries, and receipts from Meta. Those are section 4.

### Status on production

As of this writing `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `META_APP_ID`,
`META_APP_SECRET`, `WHATSAPP_CONFIG_ID` and `META_WEBHOOK_VERIFY_TOKEN` are **not set** on
the production deployment. Instagram and WhatsApp therefore show "Configuration required",
no flow can be started, and nothing here has been exercised against Meta itself.

---

## 2. META DASHBOARD CONFIGURATION — your checklist

Everything below happens at <https://developers.facebook.com/apps>. Daythread cannot do any
of it. After each step the Integrations page updates on its own — there is nothing to click
in Daythread.

### 2.1 Create the app

1. **Create App** → type **Business**.
2. Note the **App ID** and **App Secret** (Settings → Basic). These are `META_APP_ID` and
   `META_APP_SECRET`.
3. Settings → Basic: set the Privacy Policy URL to `https://daythread.org/privacy` and the
   Terms of Service URL to `https://daythread.org/terms`. App Review will not start without
   them.

### 2.2 Instagram

1. Add the product **Instagram** → **API setup with Instagram login**.
2. In **Business login settings**:
   - **OAuth redirect URI**: `https://daythread.org/api/auth/instagram/callback`
   - **Deauthorize callback URL**: `https://daythread.org/api/webhooks/meta`
   - **Data deletion request URL**: `https://daythread.org/api/webhooks/meta`
3. Copy the **Instagram app ID** and **Instagram app secret** shown on that screen into
   `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`. They are *not* the same as the Meta app id
   and secret from step 2.1 — using the Facebook ones here is the most common setup mistake.
4. Permissions Daythread requests: `instagram_business_basic`,
   `instagram_business_manage_messages`.
5. **Webhooks** (on the Instagram product): callback URL
   `https://daythread.org/api/webhooks/meta`, verify token = your
   `META_WEBHOOK_VERIFY_TOKEN`. Subscribe to the **`messages`** field.
6. Add your own Instagram account under **Roles → Instagram Testers** and accept the
   invitation from Instagram → Settings → Website permissions → Apps and websites.

### 2.3 WhatsApp

1. Add the product **WhatsApp**.
2. Add the product **Facebook Login for Business**, and set the redirect URI
   `https://daythread.org/api/auth/whatsapp/callback`.
3. **Embedded Signup**: create a configuration (WhatsApp → Embedded Signup, or Facebook
   Login for Business → Configurations) with login variation **WhatsApp Embedded Signup**
   and the permissions `whatsapp_business_management`, `whatsapp_business_messaging`,
   `business_management`. Copy the configuration id into `WHATSAPP_CONFIG_ID`.
4. **Webhooks** (on the WhatsApp product): callback URL
   `https://daythread.org/api/webhooks/meta`, verify token = your
   `META_WEBHOOK_VERIFY_TOKEN`. Subscribe to the **`messages`** field (this one field carries
   inbound messages *and* the sent / delivered / read / failed receipts).
5. The business that connects needs a Meta Business account and a phone number that is **not**
   registered on the consumer WhatsApp app.

### 2.4 The webhook handshake

Meta verifies the URL by calling it with `hub.mode=subscribe`. Daythread answers only when
`hub.verify_token` matches `META_WEBHOOK_VERIFY_TOKEN` exactly. If the variable is not set
the endpoint answers **501** and Meta's verification fails — set the variable and redeploy
*before* pressing Verify.

### 2.5 Deployment

Set the variables on the production environment and redeploy. Then, as an owner, open
Settings → Integrations → **Deployment → Meta configuration**: every row should read
Configured, and the three URLs shown there are exactly what you pasted into Meta.

---

## 3. META APPROVAL — what no amount of code can finish

- **Instagram**: `instagram_business_manage_messages` needs **App Review** for advanced
  access. Until it is granted, only Instagram accounts added as **Instagram Testers** on the
  app can connect. Personal accounts can never connect; the account must be **Business** or
  **Creator**, and Daythread refuses a personal account with that exact message rather than
  storing a connection that could not send.
- **WhatsApp**: needs a **Meta Business** and, past the starter tier, **Business
  verification**. A phone number must be added and verified on the WhatsApp Business Account.
- **The 24-hour customer service window** is Meta policy, not a Daythread limitation. A
  free-form reply is only allowed within 24 hours of the customer's last message. Outside it,
  Meta rejects the send with error 131047 and only an **approved message template** works.

### Template messages: the honest status

**Not implemented.** `templatesEnabled()` returns `false`, and nothing in the product claims
otherwise. What exists is the architecture for it:

- `listWhatsAppTemplates(token, wabaId)` — real, read-only.
- `sendWhatsAppTemplate(token, phoneNumberId, to, template)` — a real Cloud API call,
  deliberately not reachable from the composer.
- The server refuses an out-of-window send *before* the network, records the message as
  `NOT_DELIVERED` with `statusDetail = "window_closed"`, and the thread says: *"Saved, not
  delivered — WhatsApp only allows a free-form reply within 24 hours…"*

Finishing it needs: template creation and submission on the business's own WABA, storing the
approved name/language/parameters, and a composer that picks a template when the window is
shut. That work is blocked on a real, verified WABA existing.

---

## 4. Testing it before review

With the variables set and your own account added as a tester:

1. Settings → Integrations → **Instagram → Connect**. Meta's own screen appears; approve.
   You come back to a card reading `@yourhandle` and **Connected**.
2. Send a DM to that account from another Instagram account. It appears in the inbox within
   seconds, over the webhook.
3. Reply from Daythread. The reply arrives in Instagram, and the message shows **Sent**.
4. **WhatsApp → Connect** runs Meta's Embedded Signup. After it completes, the card shows the
   number and **Connected**; **Manage** shows the business account, the number, its
   verification and quality, and which numbers Meta granted.
5. Message the WhatsApp number from a phone. It arrives in the inbox; reply and watch the
   message move **Sent → Delivered → Read** as Meta's receipts arrive.
6. Wait 24 hours and reply again: it is saved and clearly marked **Not delivered**, with the
   window explained. That is correct behaviour, not a bug.

### Things worth deliberately breaking

- Change one character of a webhook body and re-sign it: **401**.
- Send a signature of the right length with non-hex characters: **401** (never a 500).
- Deliver the same event twice: the second is acknowledged as a duplicate and not reprocessed.
- Point an event at a phone number id nobody connected: ignored, and an OpsEvent is recorded.
- Disconnect: Meta's subscription is removed, the credential is erased, the plan slot is
  released — and every conversation, message and customer stays.

---

## 5. Troubleshooting

| Symptom | Cause |
|---|---|
| Meta's webhook verification fails | `META_WEBHOOK_VERIFY_TOKEN` not set on the deployment (endpoint answers 501), or the token differs by a character |
| `connect_error=configuration` | The product's variables aren't all set — check the Meta configuration panel |
| `connect_error=account_type` | The Instagram account is personal; switch it to Business or Creator |
| `connect_error=scopes` | The messaging permission was not granted — reconnect and approve everything |
| `connect_error=in_use` | That Instagram account or WhatsApp number is connected to another workspace |
| `connect_error=no_waba` / `no_phone` | Embedded Signup finished without granting a WABA, or the WABA has no phone number yet |
| `connect_error=limit` | The plan's connected-integrations allowance is full |
| `connect_error=state` / `session` / `tenant` | The callback could not be tied back to the browser, user and workspace that started it — start again from the Integrations page |
| Connected, but no DMs arrive | The webhook subscription failed; the card says so. Reconnect to retry, and check the `messages` field is subscribed in the Meta dashboard |

## Reconciliation and subscription health

- The daily cron checks each connected Instagram account's subscription (`subscribed_apps`)
  for the `messages` field, re-subscribes once when it is missing, and records the result in
  `Integration.settings.webhooksSubscribed`; the channel card and the founder dashboard say
  "connected but not receiving" instead of "connected" when it is false.
- "Check for messages" and the daily cron pull the recent conversations from the Graph API
  and ingest anything newer than the last sync, idempotent on Meta's message id — a DM whose
  webhook was missed still lands; one that was delivered is never duplicated.
- `Integration.lastWebhookAt` records the last verified event Meta delivered for the account.
- A message that arrives for an account whose token expired is still stored (Meta does not
  replay), and answered once the owner reconnects.
