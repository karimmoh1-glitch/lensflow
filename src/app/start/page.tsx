import type { Metadata } from "next";
import { googleOAuthConfigured } from "@/lib/google";
import { subscriptionBillingIsLive } from "@/lib/subscriptionBilling";
import { PLANS } from "@/lib/billing";
import { StartFlow } from "./StartFlow";

export const metadata: Metadata = {
  title: "Start — Daythread",
  description: "Tell us how you work, and we'll set Daythread up for you. Free to start.",
  alternates: { canonical: "/start" },
};

/**
 * "Start free" lands here: a short set of questions about how this person works, then
 * the account. The answers shape the recommendation on the last question, the workspace
 * that gets built, and what the product puts first — before any plan is chosen and
 * before anything is paid for. The server only says what this deployment can do (Google
 * sign-in, whether upgrades are open) so the flow never promises what it can't deliver.
 */
export default function StartPage() {
  return <StartFlow google={googleOAuthConfigured()} billingLive={subscriptionBillingIsLive} prices={{ PRO: PLANS.PRO.priceCents, BUSINESS: PLANS.BUSINESS.priceCents }} />;
}
