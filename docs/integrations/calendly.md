# Calendly

Meetings booked through Calendly become Daythread bookings for the person who booked.
Nothing is written to Calendly except the webhook subscription.

## Create the OAuth app (developer.calendly.com → My Apps)

1. New app, environment **Production**, type **Web**.
2. Redirect URI: `https://daythread.org/api/auth/calendly/callback`.
3. Copy Client ID and Client Secret.

## Environment

| Variable | Value |
|---|---|
| `CALENDLY_CLIENT_ID` | Client ID |
| `CALENDLY_CLIENT_SECRET` | Client Secret |

## Behaviour

- Import on connect (30 days back, a year ahead), on "Check for messages", and daily.
  Each Calendly event maps to one booking by its event URI (`Booking.sourceEventId`), so
  every path updates the same booking. Cancellations cancel it.
- A service is created per Calendly event type name (hidden from the booking page until
  the owner switches it on) unless one with that name already exists.
- Webhooks (`invitee.created`, `invitee.canceled`) are subscribed at connect with a
  per-connection signing key derived from the deployment secret — never stored. Calendly
  refuses subscriptions on its free plan; the card then says updates come from the daily
  check instead. Signatures are verified with a five-minute tolerance; anything that
  fails is a 401 and is not stored.
- Refresh tokens rotate on every refresh and are stored encrypted. Disconnect deletes the
  webhook subscription and revokes the token.
