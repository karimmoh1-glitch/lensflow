# Zoom

A business owner connects their own Zoom account. Daythread then makes one Zoom meeting per
booking on that account, moves it when the booking moves and deletes it when the booking is
canceled. The client sees the join link on the booking and in their portal. The host's start
link is fetched from Zoom only when the host presses Start and is never stored.

Daythread reads nothing else from Zoom: no recordings, participants, chat or contacts.

## Create the app (marketplace.zoom.us → Develop → Build App → General App)

1. **Basic Information**
   - Select how the app is managed: **User-managed**.
   - OAuth Redirect URL: `https://daythread.org/api/auth/zoom/callback`
   - OAuth Allow List: `https://daythread.org/api/auth/zoom/callback`
   - Add `http://localhost:3000/api/auth/zoom/callback` to both only on a separate development app.
2. **Scopes** — add exactly these, nothing more:
   - `meeting:write:meeting` (create)
   - `meeting:read:meeting` (fetch the host's start link on demand)
   - `meeting:update:meeting` (move with a reschedule)
   - `meeting:delete:meeting` (remove / cancel)
   - `user:read:user` (who connected, to stop one Zoom user being connected to two workspaces)
3. **Access → Event Subscriptions** (optional, recommended):
   - Endpoint URL: `https://daythread.org/api/webhooks/zoom`
   - Event: **App Deauthorized** only.
   - Copy the **Secret Token**. Zoom validates the URL when you save; Daythread answers
     the validation only when the request carries a valid signature, so set
     `ZOOM_WEBHOOK_SECRET_TOKEN` in Vercel and redeploy **before** pressing Validate.
   - Zoom only sends `app_deauthorized` to apps published on the Marketplace. Until the app
     is published, a user removing Daythread in Zoom is noticed at the next failed call
     (the card then says *Needs attention*).
4. **App Credentials**: copy Client ID and Client Secret (production credentials, not the
   development pair, once the app is published).
5. PKCE is used on every connection (`code_challenge_method=S256`).

## Environment

| Variable | Value |
|---|---|
| `ZOOM_CLIENT_ID` | App Credentials → Client ID |
| `ZOOM_CLIENT_SECRET` | App Credentials → Client Secret |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | Access → Secret Token. Without it `/api/webhooks/zoom` answers 501. |

Set them in Vercel → Project → Settings → Environment Variables → Production, then redeploy.
Never commit them and never put real values in `.env.example`. `NEXT_PUBLIC_APP_URL` must be
`https://daythread.org` so the redirect URI sent to Zoom matches the one registered.

## Behaviour

- **Connect** (owner or admin only): signed single-use state bound to the browser and the
  workspace, PKCE, code exchanged server-side with HTTP Basic client auth. A grant without a
  refresh token is refused and given back. Tokens are stored encrypted (AES-256-GCM).
- **One Zoom user, one workspace.** Connecting a Zoom user already connected elsewhere is
  refused with "already connected to another Daythread workspace".
- **Tokens**: access tokens last an hour. Refresh tokens rotate on every use, so refreshes
  are serialized per connection with a row lock; concurrent requests refresh once.
- **Create meeting** (owner, admin, photographer): scheduled meeting (type 2), booking's
  duration and the business's timezone, waiting room on, join before host off. The booking
  is claimed before Zoom is called, so double clicks make one meeting. The join link fills
  the booking location only if it was empty. Rate limited to 60 per workspace per hour.
- **Start**: fetches `start_url` from Zoom and opens it; rate limited to 120 per hour.
- **Reschedule** updates the meeting at Zoom; a Zoom failure never blocks the move.
- **Cancel** deletes the meeting at Zoom; the booking is canceled even if Zoom is down.
- **Remove** deletes at Zoom; a meeting Zoom no longer has counts as removed.
- **Disconnect** revokes the token at Zoom and erases it here. Existing meetings stay in
  Zoom; their join links keep working.
- **Deauthorized in Zoom** (published apps): the signed event erases that user's tokens,
  matched by Zoom user id *and* account id.
- Errors shown to users are Daythread sentences. Zoom's messages are never shown or logged
  because they can echo request data.

## Verifying in production

1. Settings → Integrations → Zoom → Connect. Approve on Zoom. The card shows Connected with
   the Zoom account email.
2. Open a future booking → Create Zoom meeting. The join link appears; check the meeting
   exists in zoom.us → Meetings with the right time and timezone.
3. Press Start in Zoom: Zoom opens as host.
4. Reschedule the booking: the meeting's time changes in Zoom.
5. Cancel the booking: the meeting is gone from Zoom.
6. Disconnect: the card shows Not connected; zoom.us → Apps no longer lists Daythread.

Until these steps have been done with a real Zoom account, the integration is built and
tested against stubs, not proven against Zoom.
