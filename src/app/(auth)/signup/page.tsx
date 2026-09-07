import { redirect } from "next/navigation";

/** Signup starts with a few questions about how you work; /start is that flow, and the
 * account form is its last step. Old links keep working. */
export default function SignupPage() {
  redirect("/start");
}
