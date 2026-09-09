# Twilio (SMS) — production setup

Daythread's SMS is **platform-owned**: one Twilio account (yours) buys a dedicated number per
business from inside the product. Owners never see Twilio credentials, and every inbound and
outbound text is scoped by the business's own number. The code is in `src/lib/twilio.ts`,
`src/lib/channels/smsAdapter.ts`, `src/app/actions/connect.ts` (search / claim / release) and
the two webhook routes below.

## Environment variables (read by the code)

| Variable | Required | Purpose |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Yes | Your Twilio account SID (Console → Account Info). |
| `TWILIO_AUTH_TOKEN` | Yes | Your Twilio auth token (same screen). Also used to **verify the signature** of every inbound webhook and status callback. |
| `TWILIO_FROM_NUMBER` | No | A platform fallback sender for a business that has no number of its own. Normally unset — each business claims its own number. |
| `NEXT_PUBLIC_APP_URL` | Yes (already set) | The webhook URLs are built from it when a number is bought. |

Nothing else. Without the two required variables the product says "Text messaging isn't
available on this deployment yet" and nothing crashes.

## The webhooks (already implemented)

| Purpose | URL | Method |
|---|---|---|
| A message comes in | `https://daythread.org/api/webhooks/twilio/sms` | POST (form-encoded, `X-Twilio-Signature` verified) |
| Delivery status | `https://daythread.org/api/webhooks/twilio/status` | POST (form-encoded, signature verified) |

When a business claims a number from **Settings → Channels → Text messages**, the code sets
both URLs on the purchased number itself (`incomingPhoneNumbers.create` with `smsUrl` and
`statusCallback`), so **no Console webhook configuration is needed for numbers bought
through Daythread**. Outbound sends also pass `statusCallback` explicitly.

If you ever attach a number that was **not** bought through the product (for example as
`TWILIO_FROM_NUMBER`), set those two URLs on it in the Twilio Console under Phone Numbers →
Manage → Active numbers → the number → Messaging configuration ("A message comes in" =
Webhook, POST, the sms URL; "Status callback URL" = the status URL). Label names are Twilio's
and may move; the URLs and methods above are what the code expects.

## What happens

- **Inbound**: Twilio POSTs From/To/Body/MessageSid → signature verified against
  `TWILIO_AUTH_TOKEN` → the destination number resolves to exactly one business
  (`Business.twilioPhoneNumber` is unique) → the same ingestion as every channel → stored
  once per `MessageSid` (database-unique per conversation) → the workspace's inbox version
  bumps → open browsers refresh. An MMS with no caption is stored as `[media attachment]`.
- **Outbound**: the reply goes out with the business's number as sender; Twilio's `sid` is
  stored as the message's provider id and the message is SENT; the status callback moves
  it to delivered or failed (with Twilio's error code) and never backwards.
- **Unknown destination**: acknowledged with an empty TwiML response so Twilio does not
  retry, and nothing is stored.

## Setting it up

1. In Vercel → Project → Settings → Environment Variables, add `TWILIO_ACCOUNT_SID` and
   `TWILIO_AUTH_TOKEN` for **Production** (mark as sensitive). Do not add
   `TWILIO_FROM_NUMBER` unless you want a shared fallback sender.
2. Redeploy (variables apply on the next deployment).
3. In Daythread, as an owner on Pro or above: Settings → Channels → Text messages → choose a
   number (optionally by area code) → Claim. The number is bought on your Twilio account
   with both webhooks set.
4. **End-to-end test**: text the new number from your phone. Within a few seconds the
   conversation appears in the inbox without a click (the live stream), classified as a
   person. Reply from the thread; the message shows SENT, then "delivered" once Twilio
   reports it. Founder dashboard → the workspace → Channels shows "last event" for SMS.
5. Trial accounts: Twilio trial numbers can only text verified numbers and prefix a trial
   notice; upgrade the Twilio account before real customers.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Inbound texts never arrive, Twilio debugger shows 403 | `TWILIO_AUTH_TOKEN` in Vercel differs from the account's token (signature mismatch). |
| 501 from the webhook | `TWILIO_AUTH_TOKEN` missing on the deployment. |
| Reply shows "not delivered: no text number" | The business hasn't claimed a number. |
| Reply FAILED with a Twilio code | Twilio refused (unverified destination on a trial account, carrier block); the code is on the message. |
