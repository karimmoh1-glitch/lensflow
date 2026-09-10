import { prisma } from "@/lib/db";
import { completeOAuthConnect } from "@/server/oauthConnect";
import { exchangeCalendlyCode, calendlyMe, revokeCalendlyToken, createCalendlyWebhook, calendlySigningKey } from "@/lib/calendly";
import { syncCalendlyForBusiness, type CalendlySettings } from "@/server/calendlySync";

/**
 * Calendly's callback. After the row is connected: a webhook subscription is attempted
 * (a paid Calendly feature — refused is recorded, not hidden) and the last 30 days of
 * meetings are imported.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return completeOAuthConnect(req, {
    oauthProvider: "calendly",
    purposes: ["scheduling"],
    providerFor: () => "CALENDLY",
    requireRefreshToken: true,
    exclusive: true,
    exchange: (code) => exchangeCalendlyCode(code),
    identity: async (tokens) => {
      const me = await calendlyMe(tokens.accessToken);
      const settings: CalendlySettings = { userUri: me.uri, organization: me.organization, schedulingUrl: me.schedulingUrl, name: me.name };
      return { externalId: me.uri, externalAccount: me.email, scopes: tokens.scope, settings: settings as Record<string, unknown> };
    },
    revoke: (tokens) => revokeCalendlyToken(tokens.accessToken),
    revokePrevious: async (previous) => { if (previous.refreshToken) await revokeCalendlyToken(previous.refreshToken); },
    afterActivate: async (row, tokens) => {
      const settings = (row.settings ?? {}) as CalendlySettings;
      const hook = settings.userUri && settings.organization ? await createCalendlyWebhook(tokens.accessToken, { userUri: settings.userUri, organization: settings.organization, signingKey: calendlySigningKey(row.id) }) : { ok: false as const, reason: "error" as const };
      const webhooks: CalendlySettings["webhooks"] = hook.ok ? "active" : hook.reason === "plan" ? "unavailable" : hook.reason === "exists" ? "active" : "error";
      await prisma.integration.update({ where: { id: row.id }, data: { settings: { ...settings, webhooks, webhookUri: hook.ok ? hook.uri : (settings.webhookUri ?? null), webhookDetail: hook.ok ? null : (hook.detail ?? null) } } });
      await syncCalendlyForBusiness(row.businessId);
    },
  });
}
