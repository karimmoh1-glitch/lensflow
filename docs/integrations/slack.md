# Slack

Daythread posts short notices to one channel: "Jane wrote to you", "New booking · Sat 2pm",
"Gmail needs attention". Names, channels and times — never a customer's message text.

## Create the app (api.slack.com/apps → Create New App → From scratch)

1. OAuth & Permissions → Redirect URLs: `https://daythread.org/api/auth/slack/callback`.
2. Bot Token Scopes: `chat:write`, `channels:read`, `channels:join`.
3. Basic Information → App Credentials: copy Client ID and Client Secret.
4. Distribute the app (Manage Distribution → activate public distribution) so workspaces
   other than the one that created the app can install it.

## Environment

| Variable | Value |
|---|---|
| `SLACK_CLIENT_ID` | Client ID |
| `SLACK_CLIENT_SECRET` | Client Secret |

## Behaviour

- OAuth v2 install returns a bot token (no expiry unless token rotation is turned on in
  the app; Daythread does not turn it on). Stored encrypted.
- The channel is chosen under Manage after install; the bot joins public channels itself.
  A first message is posted so the choice is verified, not assumed. Nothing is posted
  until a channel is chosen.
- A post refused for `channel_not_found` / `is_archived` marks the row *Sync issue* with
  "choose another"; `invalid_auth` / `token_revoked` marks it *Needs attention*.
- Disconnect calls `auth.revoke` before erasing the token.
