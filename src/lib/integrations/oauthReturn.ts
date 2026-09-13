import { appBaseUrl } from "@/lib/meta/config";
import type { OAuthReturn } from "./oauthState";

/**
 * Where a callback sends the browser. Built from the deployment's own configured URL (the
 * request host is only a fallback), and from the closed `returnTo` set the signed state
 * carries: the hub's Channels tab, or onboarding's connect step. Nothing about the
 * destination comes from the request.
 */
export function oauthLanding(requestOrigin: string, returnTo: OAuthReturn | null | undefined): URL {
  const base = appBaseUrl() || requestOrigin;
  if (returnTo === "onboarding") {
    const url = new URL("/onboarding", base);
    url.searchParams.set("step", "connect");
    return url;
  }
  const url = new URL("/dashboard/settings", base);
  url.searchParams.set("tab", "connections");
  return url;
}
