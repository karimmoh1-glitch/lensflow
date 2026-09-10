# Instagram: invite-only beta

While Meta's app review for `instagram_business_manage_messages` is pending, only accounts
added as testers on the Meta app can connect. Daythread makes that honest in the product:

- `INTEGRATION_INSTAGRAM_MODE=invite` (default): the card shows **Beta** and a *Request
  access* control. The request lands on the founder dashboard (`/admin/growth`) with the
  workspace, plan and note. Approving it turns the card's control into *Connect*; the
  workspace then completes Meta's real authorization like any other. Declining or revoking
  is recorded and the workspace is told (in-app, push, Slack).
- `open`: no request needed; every workspace sees *Connect* (after Meta approves the app).
- `off`: the card is not shown.

The gate is Daythread's own and sits in front of Meta's: approving a workspace here does
not add it as a tester on the Meta app, and Meta still decides whether messages are
delivered. Add the workspace's Instagram account as a tester in the Meta app before
approving, or the connect will fail at Meta with a clear reason.

`INTEGRATION_WHATSAPP_MODE=coming_soon` (default) shows WhatsApp as **Coming soon** with no
connect control. The Embedded Signup flow stays in the code; set the mode to `open` once
Meta business verification is complete.
