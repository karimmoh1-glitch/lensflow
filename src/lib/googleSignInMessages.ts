/** What the login page says for each way "Continue with Google" can end without a session.
 * Client-safe: no server imports, so the login form can show these directly. */
export type GoogleSignInFailure = "denied" | "provider" | "state" | "expired" | "unverified" | "no_email";

export const GOOGLE_SIGN_IN_MESSAGES: Record<GoogleSignInFailure | "unavailable" | "rate", string> = {
  denied: "Google sign-in was canceled. You can try again or use your email and password.",
  provider: "Google didn't complete the sign-in. Nothing was changed — try again in a moment.",
  state: "That sign-in link wasn't valid. Start again from this page.",
  expired: "That sign-in took too long and expired. Start again from this page.",
  unverified: "Google hasn't verified that email address, so it can't be used to sign in. Use your email and password instead.",
  no_email: "Google didn't share an email address, so there's nothing to sign in with.",
  unavailable: "Google sign-in isn't available on this deployment yet.",
  rate: "Too many attempts. Please wait a few minutes and try again.",
};
