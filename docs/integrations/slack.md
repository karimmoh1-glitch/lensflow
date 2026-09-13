# Slack

Daythread posts short notices to one channel: "Jane wrote to you", "New booking · Sat 2pm",
"Gmail needs attention". Names, channels and times — never a customer's message text.

## Create the app (api.slack.com/apps → Create New App → From scratch)

1. OAuth & Permissions → Redirect URLs: `https://daythread.org/api/auth/slack/callback`.
2. Bot Token Scopes: `chat:write`, `channels:read`, `channels:join`. No user token scopes.
   Leave token rotation off (Daythread stores the non-expiring bot token encrypted); Slack's
   OAuth v2 has no PKCE option.
3. Event Subscriptions → on. Request URL: `https://daythread.org/api/webhooks/slack/events`
   (Slack verifies it on save; the route answers the challenge only when the request is
   signed). Subscribe to bot events `app_uninstalled` and `tokens_revoked` — nothing else.
   Daythread reads no messages from Slack.
4. Basic Information → App Credentials: copy Client ID, Client Secret and Signing Secret.
5. Interactivity, Slash Commands, Incoming Webhooks, Socket Mode and App Home stay off.
6. Distribute the app (Manage Distribution → activate public distribution) so workspaces
   other than the one that created the app can install it. For testing in the workspace that
   owns the app, distribution is not needed.

## Environment

| Variable | Value |
|---|---|
| `SLACK_CLIENT_ID` | Client ID (Basic Information → App Credentials) |
| `SLACK_CLIENT_SECRET` | Client Secret (same screen) |
| `SLACK_SIGNING_SECRET` | Signing Secret (same screen). Verifies every post to the events URL. Without it the events route answers 501 and an uninstall is only noticed at the next failed post. |

All three go in Vercel's Production environment (and Preview if you test previews); none are needed for local development unless driving the real flow.

## Behaviour

- OAuth v2 install returns a bot token (no expiry unless token rotation is turned on in
  the app; Daythread does not turn it on). Stored encrypted.
- The channel is chosen under Manage after install; the bot joins public channels itself.
  A first message is posted so the choice is verified, not assumed. Nothing is posted
  until a channel is chosen.
- A post refused for `channel_not_found` / `is_archived` marks the row *Sync issue* with
  "choose another"; `invalid_auth` / `token_revoked` marks it *Needs attention*.
- Disconnect calls `auth.revoke` before erasing the token.
- Reinstalling into the same workspace keeps the chosen channel; installing a different
  workspace sends the owner back to the picker.
- A 429 from Slack is recorded as a wait, not a broken connection.
- Events: `app_uninstalled` / `tokens_revoked` for a team mark every business that installed
  that team *Needs attention* with "reconnect", and drop the dead token. Signature
  (`v0=HMAC-SHA256(v0:timestamp:body)`) and a five-minute window are checked before parsing;
  each event id is processed once.
