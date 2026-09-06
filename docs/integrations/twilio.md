# Twilio SMS

Daythread owns one Twilio account; each business gets its own number from it (Settings →
Integrations → Messages (SMS) → choose a number). Pro and Business plans only.

## Implemented

- Number search and purchase per business (`searchSmsNumbers`, `claimSmsNumber` in
  `src/app/actions/connect.ts`), release on disconnect. The purchase is inside the
  connected-integrations quota; a refused activation releases the number again.
- Outbound SMS from the business's own number (`src/lib/channels/smsAdapter.ts`), with the
  status callback so delivered / failed states reach the thread.
- Inbound webhook `POST /api/webhooks/twilio/sms` with `X-Twilio-Signature` validation, routed
  to the business that owns the destination number, ingested through the same pipeline as
  every other channel.
- Status webhook `POST /api/webhooks/twilio/status` (signature-validated, tested).

## Configuration (human action)

1. Twilio Console → Account → copy the **Account SID** and **Auth Token** into
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (Vercel, Production).
2. Optional `TWILIO_FROM_NUMBER` as a platform fallback sender.
3. When a business claims a number, Daythread configures its inbound webhook to
   `https://daythread.org/api/webhooks/twilio/sms` and status callback to
   `https://daythread.org/api/webhooks/twilio/status` (see `src/lib/twilio.ts`).
4. US numbers need A2P 10DLC registration for reliable delivery; toll-free numbers need
   verification. Both are Twilio-side, per number.
