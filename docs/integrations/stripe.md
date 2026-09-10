# Stripe (the business's own account)

Not to be confused with Daythread's own subscription billing (`STRIPE_SECRET_KEY` +
`STRIPE_WEBHOOK_SECRET`, unchanged). This connection lets a business link **its** Stripe
account so payments it receives are recorded against the right person. Daythread never
creates charges, refunds, transfers or payouts.

## Enable Connect on Daythread's Stripe account

1. Dashboard → Connect → Get started; choose **Standard** accounts (the business keeps its
   own dashboard and payouts).
2. Connect → Settings → Integration → OAuth: enable OAuth for Standard accounts, add
   redirect URI `https://daythread.org/api/auth/stripe/callback`, copy the **live** client
   id (`ca_…`). Test mode has its own `ca_…`.
3. Developers → Webhooks → Add endpoint `https://daythread.org/api/webhooks/stripe/connect`
   with **Listen to events on Connected accounts** selected, events
   `payment_intent.succeeded`, `charge.refunded`, `account.application.deauthorized`.
   Copy its signing secret.

## Environment

| Variable | Value |
|---|---|
| `STRIPE_CONNECT_CLIENT_ID` | `ca_…` |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret of the Connect endpoint |

## Behaviour

- The account id is the identity; the same account cannot be linked to two workspaces.
- `payment_intent.succeeded` → one `Payment` (CARD, PAID) keyed by the payment intent id,
  matched to a client by the charge's billing email or phone, else a new customer record.
  `charge.refunded` → the same row becomes REFUNDED. `account.application.deauthorized`
  → the connection is marked disconnected and the owner is told.
- Both webhook endpoints go through the shared inbox: claimed by event id, retried from
  the stored event when a handler fails, dead-lettered after five attempts.
