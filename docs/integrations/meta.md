# Meta: Instagram and WhatsApp

Everything on Daythread's side is built and tested with recorded Meta responses. What remains
is Meta-side configuration and review, which only the app owner can do.

## What Daythread implements

| Piece | Where | Status |
|---|---|---|
| Instagram Login (OAuth) start | `src/app/actions/connect.ts` → `connectInstagram` | built, plan-quota checked |
| Instagram callback: code → long-lived token → profile → webhook subscription → first DM pull | `src/app/api/auth/instagram/callback/route.ts` | built, tested |
| Instagram 60-day token refresh | `src/server/integrationMaintenance.ts` (daily cron) | built |
| WhatsApp Embedded Signup start | `connectWhatsApp` | built |
| WhatsApp callback: code → business token → WABA + phone → webhook subscription | `src/app/api/auth/whatsapp/callback/route.ts` | built, tested |
| One webhook for both products (verify + signed events + idempotency + tenant routing) | `src/app/api/webhooks/meta/route.ts`, `src/server/metaInbound.ts` | built, tested |
| Sending (Instagram DM, WhatsApp text within the 24h window) | `src/server/deliver.ts` | built |
| Token revocation / expiry → "Needs attention" | `deliver.ts`, maintenance sweep | built |

Credentials are stored encrypted (AES-256-GCM) and never leave the server.

## What is tested (automated, recorded Meta responses)

| Area | Test file | Cases |
|---|---|---|
| Instagram callback | `src/app/api/auth/instagram/callback/route.test.ts` | connect end to end (long-lived token encrypted at rest, profile, webhook subscription, first DMs ingested), replayed state, forged state, expired state, wrong session, wrong tenant, personal account refused, account already connected elsewhere refused, plan quota enforced, canceled authorization |
| WhatsApp callback | `src/app/api/auth/whatsapp/callback/route.test.ts` | connect end to end (WABA + phone association, webhook subscription, encryption), replay, expiry, wrong tenant, no WABA, no phone, phone already connected elsewhere |
| Webhook | `src/app/api/webhooks/meta/route.test.ts` | verify handshake, bad signature, malformed body, Instagram DM routed to owner once (duplicate ignored), unknown account ignored, echoes ignored, WhatsApp statuses applied only to the owning business, WhatsApp text ingested with E.164 identity |
| Outbound | `src/app/actions/integrationIsolation.test.ts` | Instagram/WhatsApp sends are NOT_DELIVERED when not connected; WhatsApp refuses outside the 24-hour window; cross-tenant sends impossible (the sending integration is looked up by the caller's business) |
| Identity | `src/server/identity.test.ts` | same person joined across email / phone / Instagram inside one business only |

Not tested, because it needs a real Meta app: the live consent screens, real webhook
deliveries, and delivery/read receipts from Meta. Those are the first thing to try after
the configuration below.

## Status on production (2026-09-06)

`INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `META_APP_ID`, `META_APP_SECRET`,
`WHATSAPP_CONFIG_ID`, `META_WEBHOOK_VERIFY_TOKEN` are **not set**. The Integrations page
shows Instagram and WhatsApp as "Configuration required" and nobody can start a flow.
Nothing below has been exercised against Meta itself.

## Meta App Dashboard steps (human action)

1. Create a Meta app of type **Business**. Add the products **Instagram** (Instagram API with
   Instagram Login) and **WhatsApp**.
2. Instagram → API setup with Instagram login:
   - OAuth redirect URI: `https://daythread.org/api/auth/instagram/callback`
   - Deauthorize / data-deletion callback: `https://daythread.org/api/webhooks/meta`
   - Copy the **Instagram app ID** and **app secret** into `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`.
   - Permissions requested by Daythread: `instagram_business_basic`, `instagram_business_manage_messages`.
3. WhatsApp → Embedded Signup:
   - Create a configuration; copy its id into `WHATSAPP_CONFIG_ID`.
   - Facebook Login for Business redirect URI: `https://daythread.org/api/auth/whatsapp/callback`
   - App id / secret into `META_APP_ID`, `META_APP_SECRET`.
   - Permissions: `whatsapp_business_management`, `whatsapp_business_messaging`.
4. Webhooks (both products): callback URL `https://daythread.org/api/webhooks/meta`, verify
   token = the value you set in `META_WEBHOOK_VERIFY_TOKEN` (any long random string).
   Subscribe to `messages` (Instagram) and `messages` (WhatsApp Business Account).
5. Set the variables on Vercel (Production), redeploy. The Integrations page flips from
   "Configuration required" to "Available" on its own — nothing else changes.

## Review and verification (human action, Meta timelines)

- Until **App Review** approves `instagram_business_manage_messages`, only Instagram accounts
  added as testers on the app can connect. Professional (Business/Creator) accounts only.
- WhatsApp needs a **Meta Business** with **Business verification** for anything beyond the
  starter tier, and a phone number not registered on the consumer WhatsApp app.
- Free-form WhatsApp replies are only allowed within 24 hours of the customer's last message;
  Daythread refuses later sends up front and records them as not delivered. Template messages
  are not implemented.

## Test it before review

With the variables set and your own account added as a tester, connect from
Settings → Integrations. The callback stores the account, subscribes webhooks and pulls recent
DMs. Send yourself a DM: it should appear in the inbox within seconds via the webhook.
