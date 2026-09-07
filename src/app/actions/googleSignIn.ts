"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { googleOAuthConfigured, getGoogleAuthUrl } from "@/lib/google";
import { signOAuthState } from "@/lib/integrations/oauthState";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Sends the browser to Google's account chooser for sign-in or sign-up. The state is
 * signed, short-lived, bound to this browser by a nonce cookie and marked for the
 * "signin" purpose, so a connect-a-channel state can never complete a sign-in and vice
 * versa. Only offered when the Google OAuth client is configured on this deployment.
 */
const START_COOKIE = "dt_start";

export async function startGoogleSignIn(intent: "login" | "signup", personalization?: { answers?: string; selectedPlan?: string; anonymousId?: string; ref?: string }) {
  const back = intent === "signup" ? "/start" : "/login";
  if (!googleOAuthConfigured()) redirect(`${back}?google=unavailable`);
  const ip = await getClientIp();
  if (!rateLimit(`google-signin:${ip}`, { limit: 20, windowMs: 10 * 60 * 1000 }).ok) redirect(`${back}?google=rate`);
  // The /start answers ride along in a short-lived cookie scoped to the callback, so the
  // workspace Google creates is personalized exactly like one created with a password.
  const jar = await cookies();
  if (personalization && (personalization.answers?.length ?? 0) <= 4000) {
    jar.set(START_COOKIE, JSON.stringify({ answers: personalization.answers ?? null, selectedPlan: personalization.selectedPlan ?? null, anonymousId: personalization.anonymousId ?? null, ref: personalization.ref ?? null }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/google", maxAge: 30 * 60 });
  } else {
    jar.delete({ name: START_COOKIE, path: "/api/auth/google" });
  }
  const state = await signOAuthState({ provider: "google", purpose: "signin", businessId: "signin", userId: "signin" });
  redirect(await getGoogleAuthUrl(state, "signin"));
}
