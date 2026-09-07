"use server";

import { redirect } from "next/navigation";
import { googleOAuthConfigured, getGoogleAuthUrl } from "@/lib/google";
import { signOAuthState } from "@/lib/integrations/oauthState";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Sends the browser to Google's account chooser for sign-in or sign-up. The state is
 * signed, short-lived, bound to this browser by a nonce cookie and marked for the
 * "signin" purpose, so a connect-a-channel state can never complete a sign-in and vice
 * versa. Only offered when the Google OAuth client is configured on this deployment.
 */
export async function startGoogleSignIn(intent: "login" | "signup") {
  if (!googleOAuthConfigured()) redirect(`/${intent}?google=unavailable`);
  const ip = await getClientIp();
  if (!rateLimit(`google-signin:${ip}`, { limit: 20, windowMs: 10 * 60 * 1000 }).ok) redirect(`/${intent}?google=rate`);
  const state = await signOAuthState({ provider: "google", purpose: "signin", businessId: "signin", userId: "signin" });
  redirect(await getGoogleAuthUrl(state, "signin"));
}
