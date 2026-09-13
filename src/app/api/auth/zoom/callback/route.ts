import { completeOAuthConnect } from "@/server/oauthConnect";
import { exchangeZoomCode, zoomMe, revokeZoomToken } from "@/lib/zoom";

/**
 * Zoom's callback. The shared runner does the security work — signed single-use state
 * bound to this browser and this owner, PKCE, encrypted storage, the plan's connection
 * allowance — and this names only what is Zoom's: exchange the code with the verifier,
 * learn which Zoom user this is, and give the grant back if it cannot be kept.
 *
 * A refresh token is required: Zoom's access tokens last an hour, and a connection that
 * cannot refresh would silently die by lunchtime. The same Zoom user cannot be connected
 * to two Daythread workspaces, because meetings made on it would belong to both.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return completeOAuthConnect(req, {
    oauthProvider: "zoom",
    purposes: ["meetings"],
    providerFor: () => "ZOOM",
    pkce: true,
    requireRefreshToken: true,
    exclusive: true,
    exchange: (code, verifier) => exchangeZoomCode(code, verifier!),
    identity: async (tokens) => {
      const me = await zoomMe(tokens.accessToken);
      return { externalId: me.id, externalAccount: me.email || me.name, scopes: tokens.scope, settings: { accountId: me.accountId, name: me.name } };
    },
    revoke: (tokens) => revokeZoomToken(tokens.accessToken),
    revokePrevious: async (previous) => { if (previous.accessToken) await revokeZoomToken(previous.accessToken); },
  });
}
