import { prisma } from "@/lib/db";
import { completeOAuthConnect } from "@/server/oauthConnect";
import { exchangeSlackCode, revokeSlackToken } from "@/lib/slack";
import type { SlackSettings } from "@/server/notify";

/**
 * Slack's install callback: a bot token for the workspace; the channel is chosen next.
 * Reinstalling into the same workspace keeps the channel that was already chosen — the
 * runner replaces the row's settings with the fresh identity, which used to silently drop
 * it and send the owner back to the picker after every reconnect.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return completeOAuthConnect(req, {
    oauthProvider: "slack",
    purposes: ["notifications"],
    providerFor: () => "SLACK",
    exchange: async (code) => {
      const install = await exchangeSlackCode(code);
      return { accessToken: install.accessToken, refreshToken: null, expiresAt: null, scope: install.scope, raw: { team: install.team, botUserId: install.botUserId, authedUserId: install.authedUserId } };
    },
    identity: async (tokens) => {
      const raw = tokens.raw as { team: { id: string; name: string }; botUserId: string };
      return { externalId: raw.team.id, externalAccount: raw.team.name, scopes: tokens.scope, settings: { teamId: raw.team.id, teamName: raw.team.name, botUserId: raw.botUserId, channelId: null, channelName: null } };
    },
    revoke: (tokens) => revokeSlackToken(tokens.accessToken),
    afterActivate: async (row, _tokens, identity, previous): Promise<{ redirect: Record<string, string> }> => {
      const before = (previous?.settings ?? {}) as SlackSettings;
      const sameWorkspace = Boolean(before.teamId && before.teamId === identity.externalId && before.channelId);
      if (sameWorkspace) {
        await prisma.integration.update({ where: { id: row.id }, data: { settings: { ...(identity.settings ?? {}), channelId: before.channelId, channelName: before.channelName ?? null } } });
        return { redirect: { connected: "SLACK" } };
      }
      return { redirect: { setup: "SLACK" } };
    },
  });
}
