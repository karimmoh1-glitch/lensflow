import { reportFailure } from "@/lib/observe";
import { revokeGoogleToken } from "@/lib/google";
import { revokeSlackToken } from "@/lib/slack";
import { revokeDropboxToken } from "@/lib/dropbox";
import { revokeZoomToken } from "@/lib/zoom";
import { revokeCalendlyToken, deleteCalendlyWebhook, calendlyToken } from "@/lib/calendly";
import { deauthorizeStripeAccount } from "@/lib/stripeConnect";
import { unsubscribeInstagramWebhooks, revokeInstagramPermissions } from "@/lib/meta/instagram";
import { unsubscribeWabaWebhooks } from "@/lib/meta/whatsapp";
import { twilioConfigured, releaseNumber } from "@/lib/twilio";
import type { Integration, IntegrationProvider } from "@prisma/client";

type Row = Pick<Integration, "id" | "businessId" | "provider" | "accessToken" | "refreshToken" | "externalId" | "settings">;

/**
 * Tells the provider to stop, while the credential still works: the grant is revoked, the
 * webhook subscription removed, the number released. Best effort, one provider at a time —
 * a provider that refuses never blocks the local disconnect or the deletion, and is
 * recorded rather than swallowed. Used by disconnect and by workspace deletion, so a
 * deleted workspace no longer leaves live grants at Dropbox, Zoom, Slack, Calendly, Meta
 * or Google behind (only Google and Twilio used to be told).
 */
export async function revokeProviderAccess(row: Row): Promise<void> {
  const provider: IntegrationProvider = row.provider;
  const warn = (what: string) => (err: unknown) => reportFailure("oauth", `${provider} ${what} failed`, { businessId: row.businessId, provider, error: err, level: "warn" });
  switch (provider) {
    case "EMAIL":
    case "GOOGLE_CALENDAR":
    case "GOOGLE_DRIVE": {
      const token = row.refreshToken ?? row.accessToken;
      if (token) await revokeGoogleToken(token).catch(warn("revoke"));
      return;
    }
    case "SMS":
      if (row.externalId && twilioConfigured()) await releaseNumber(row.externalId).catch(warn("number release"));
      return;
    case "SLACK":
      if (row.accessToken) await revokeSlackToken(row.accessToken).catch(warn("revoke"));
      return;
    case "ZOOM":
      // Meetings already made stay on the owner's Zoom account (they are theirs).
      if (row.accessToken || row.refreshToken) await revokeZoomToken((row.accessToken ?? row.refreshToken)!).catch(warn("revoke"));
      return;
    case "DROPBOX":
      if (row.accessToken) await revokeDropboxToken(row.accessToken).catch(warn("revoke"));
      return;
    case "STRIPE":
      if (row.externalId) await deauthorizeStripeAccount(row.externalId).catch(warn("deauthorize"));
      return;
    case "CALENDLY": {
      if (!row.refreshToken) return;
      const hook = ((row.settings ?? {}) as { webhookUri?: string }).webhookUri;
      if (hook) await calendlyToken(row as Integration).then((t) => deleteCalendlyWebhook(t, hook)).catch(warn("webhook removal"));
      await revokeCalendlyToken(row.refreshToken).catch(warn("revoke"));
      return;
    }
    case "INSTAGRAM":
      if (row.accessToken && row.externalId) {
        await unsubscribeInstagramWebhooks(row.accessToken, row.externalId).catch(warn("webhook unsubscribe"));
        // And hand the grant back, so disconnecting actually ends Daythread's access rather
        // than only stopping delivery.
        await revokeInstagramPermissions(row.accessToken, row.externalId).catch(() => {});
      }
      return;
    case "WHATSAPP": {
      const wabaId = (row.settings as { wabaId?: string } | null)?.wabaId;
      if (row.accessToken && wabaId) await unsubscribeWabaWebhooks(row.accessToken, wabaId).catch(warn("webhook unsubscribe"));
      return;
    }
    default:
      // Microsoft offers no delegated-token revocation; Apple Calendar is an app password
      // the owner revokes at Apple. Nothing to tell.
      return;
  }
}
