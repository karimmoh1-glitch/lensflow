import { completeOAuthConnect } from "@/server/oauthConnect";
import { exchangeSlackCode, revokeSlackToken } from "@/lib/slack";

/** Slack's install callback: a bot token for the workspace; the channel is chosen next. */
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
    afterActivate: async () => ({ redirect: { setup: "SLACK" } }),
  });
}
