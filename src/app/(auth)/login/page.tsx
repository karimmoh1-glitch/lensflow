import { googleOAuthConfigured } from "@/lib/google";
import { LoginForm } from "./LoginForm";

/** The server decides whether "Continue with Google" is offered: only when the OAuth client
 * is configured on this deployment, so the page never shows a sign-in that can't happen. */
export default function LoginPage() {
  return <LoginForm google={googleOAuthConfigured()} />;
}
