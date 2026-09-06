# Email in production

Two different kinds of email, two providers, one domain.

| Kind | Sender | Provider | Status |
|---|---|---|---|
| Humans writing to Daythread (support, Meta/Stripe/Apple verification, replies) | `hello@daythread.org` (+ `support@`, `privacy@` aliases) | Google Workspace mailbox | **Not created yet** — see "Mailbox" |
| The product sending on a business's behalf when its own Gmail isn't connected, password resets, invitations, owner notifications | `RESEND_FROM_EMAIL` (recommended `notifications@daythread.org`) | Resend, via `src/lib/channels/emailAdapter.ts` | **Not configured** — `RESEND_API_KEY` missing |
| A business's own replies to customers | The business's connected Gmail | Google OAuth send (`src/lib/google.ts`) | Built; needs the Google OAuth client verified for Gmail scopes |

## What the code does today without Resend

- `messagingIsLive("EMAIL")` is false. Every `sendOnChannel({ channel: "EMAIL" })` returns
  `{ ok: true, simulated: true }` and logs one line. Callers that show the customer a state
  (inbox composer, agent, automations) record the message as **NOT_DELIVERED** with the
  reason; nothing is shown as sent.
- **Password reset**: refuses in production with a message pointing at support (fixed this
  session — previously the reset link was printed on screen for anyone who typed an
  address, which was a full account-takeover hole).
- **Invitations**: the inviter gets a copyable link in Team → Invitations, so invites work
  without email.
- **Website lead → owner notification**: owner gets the in-app notification; the email is
  skipped silently. Acceptable, but turn Resend on before launch.
- **Booking confirmations** to customers go through automations → `deliverToCustomer`,
  recorded honestly.

## Remaining manual setup

### 1. Mailbox (Google Workspace) — human action

1. workspace.google.com → Business Starter → domain `daythread.org` → first user `hello@daythread.org`.
2. Verify ownership with the TXT record Google shows (Cloudflare, DNS only).
3. Admin console → Users → hello@ → Alternate emails: `support@daythread.org`, `privacy@daythread.org`.
4. Turn on 2-step verification before using it for Meta / Stripe / Apple.

### 2. DNS in Cloudflare (all **DNS only**, never proxied; add, don't remove)

| Type | Name | Content | Priority | Why |
|---|---|---|---|---|
| TXT | `@` | `google-site-verification=<from Google>` | | domain ownership |
| MX | `@` | `smtp.google.com` | 1 | inbound mail to Gmail |
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` | | SPF for Google sending |
| TXT | `google._domainkey` | `v=DKIM1; k=rsa; p=<from Admin console → Gmail → Authenticate email>` | | DKIM for Google |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:hello@daythread.org` | | DMARC reports; move to `p=quarantine` after a clean week |

Do **not** enable Cloudflare Email Routing; it inserts its own MX records.

### 3. Resend (product email) — human action

1. resend.com → Domains → Add `daythread.org`. Resend gives three records (a `send.`
   subdomain SPF/MX pair and a `resend._domainkey` DKIM TXT). Add them in Cloudflare, DNS
   only. They do not conflict with Google because they live on the `send.` subdomain and a
   separate DKIM selector.
2. API keys → create a sending key → Vercel Production env `RESEND_API_KEY`.
3. Set `RESEND_FROM_EMAIL=notifications@daythread.org` (Vercel).
4. Webhooks → add `https://daythread.org/api/webhooks/email`, event `email.received`,
   copy the signing secret → `RESEND_WEBHOOK_SECRET`. Set `RESEND_INBOUND_DOMAIN` to the
   inbound domain you configure in Resend (e.g. `in.daythread.org`, with the MX Resend gives).
5. Redeploy. The Integrations page's Gmail card is unaffected (that is the business's own
   Gmail); Settings → Billing → Setup shows nothing for Resend — check
   `messagingIsLive("EMAIL")` via a password-reset test instead.

### 4. Test (after 1–3)

- Send to `hello@daythread.org` from a personal address → arrives in Gmail.
- Reply from Gmail → in the received mail, "Show original" shows SPF, DKIM, DMARC = PASS.
- On daythread.org, use "Forgot password" with your own account → the reset email arrives
  from `RESEND_FROM_EMAIL`, link works once, second use is refused.
- Invite a partner from Team → the invitation email arrives.

## Environment variables

| Name | Required for | Status on production |
|---|---|---|
| `RESEND_API_KEY` | product email sending | MISSING |
| `RESEND_FROM_EMAIL` | sender identity | MISSING (falls back to `onboarding@resend.dev`, which only works for Resend test sends) |
| `RESEND_WEBHOOK_SECRET` | inbound email replies into the inbox | MISSING |
| `RESEND_INBOUND_DOMAIN` | per-business inbound addresses | MISSING |
