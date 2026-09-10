# Microsoft Outlook and Microsoft Calendar

One Microsoft Entra app registration serves both. Personal (Outlook.com) and work/school
accounts sign in through the `common` endpoint.

## Register the app (Azure portal → Microsoft Entra ID → App registrations)

1. New registration. Supported account types: **Accounts in any organizational directory
   and personal Microsoft accounts**.
2. Redirect URI (Web): `https://daythread.org/api/auth/microsoft/callback`.
3. Certificates & secrets → new client secret. Copy the **value** (not the id).
4. API permissions → Microsoft Graph → Delegated: `User.Read`, `Mail.Read`, `Mail.Send`,
   `Calendars.ReadWrite`, `offline_access`, `openid`, `email`. Grant admin consent only if
   your own tenant requires it; other tenants consent at connect time.

## Environment

| Variable | Value |
|---|---|
| `MICROSOFT_CLIENT_ID` | Application (client) ID |
| `MICROSOFT_CLIENT_SECRET` | The client secret value |

## What Daythread does

- **Outlook**: inbox delta sync (`/me/mailFolders/inbox/messages/delta`) on open, on
  "Check for messages", and daily; the delta link is the cursor. Every new message goes
  through the same ingestion as Gmail, keyed by `internetMessageId`. Replies are sent with
  `createReply` + `send` so they stay in the customer's thread; a fresh mail uses `sendMail`.
- **Calendar**: calendars discovered at connect; busy time pulled with `calendarView/delta`
  per selected calendar (a week back, six months ahead); bookings pushed as events with a
  `transactionId` so a retried create cannot double up. Mirrors are recognised by the
  booking that owns them.
- Tokens are short-lived and refresh tokens rotate; both are stored encrypted and rotated
  on every refresh. Microsoft has no token revocation endpoint: disconnect erases the
  stored grant, and the person can remove Daythread at https://account.live.com/consent/Manage
  or in their organization's My Apps.
