import { completeOAuthConnect } from "@/server/oauthConnect";
import { exchangeDropboxCode, dropboxCurrentAccount, revokeDropboxToken } from "@/lib/dropbox";

/** Dropbox's callback: PKCE verified, offline refresh token required, account identified. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return completeOAuthConnect(req, {
    oauthProvider: "dropbox",
    purposes: ["files"],
    providerFor: () => "DROPBOX",
    pkce: true,
    requireRefreshToken: true,
    exclusive: true,
    exchange: (code, verifier) => exchangeDropboxCode(code, verifier!),
    identity: async (tokens) => {
      const a = await dropboxCurrentAccount(tokens.accessToken);
      return { externalId: a.accountId, externalAccount: a.email, scopes: tokens.scope, settings: { displayName: a.displayName } };
    },
    revoke: (tokens) => revokeDropboxToken(tokens.accessToken),
    revokePrevious: async (previous) => { if (previous.accessToken) await revokeDropboxToken(previous.accessToken); },
  });
}
