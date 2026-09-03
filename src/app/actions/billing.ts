"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  createSubscriptionCheckout,
  createBillingPortalSession,
  changeSubscriptionPlan,
  subscriptionBillingIsLive,
} from "@/lib/subscriptionBilling";
import type { PlanKey } from "@/lib/billing";
import { track } from "@/lib/analytics";

const LIVE_SUBSCRIPTION_STATUSES = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

/** Only OWNER/ADMIN can change what the business pays Daythread — same bar as everything
 * else in Settings/Team. */
async function requireBillingRole() {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");
  return ctx;
}

export async function startUpgradeCheckout(
  planKey: Extract<PlanKey, "PRO" | "BUSINESS">
): Promise<{ url?: string; changed?: boolean; error?: string }> {
  if (!subscriptionBillingIsLive) {
    return { error: "Billing isn't configured on this deployment yet — add STRIPE_SECRET_KEY to enable real subscriptions." };
  }

  const ctx = await requireBillingRole();
  const { business } = ctx;
  await track("upgrade_clicked", { businessId: business.id, properties: { planKey } });

  // Already has a live subscription — change it in place (prorated) instead of starting
  // a second, parallel subscription through a fresh checkout.
  if (business.stripeSubscriptionId && business.billingStatus && LIVE_SUBSCRIPTION_STATUSES.has(business.billingStatus)) {
    try {
      await changeSubscriptionPlan({ business, planKey });
      revalidatePath("/dashboard/billing");
      return { changed: true };
    } catch (err) {
      console.error("[billing] plan change failed", err);
      return { error: "Couldn't change your plan. Please try again." };
    }
  }

  try {
    const { url } = await createSubscriptionCheckout({
      business: ctx.business,
      ownerEmail: ctx.user.email,
      planKey,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?upgraded=1`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    });
    await track("checkout_started", { businessId: business.id, properties: { planKey } });
    return { url };
  } catch (err) {
    console.error("[billing] checkout creation failed", err);
    return { error: "Couldn't start checkout. Please try again." };
  }
}

export async function openBillingPortal(): Promise<{ url?: string; error?: string }> {
  if (!subscriptionBillingIsLive) {
    return { error: "Billing isn't configured on this deployment yet." };
  }

  const ctx = await requireBillingRole();
  try {
    const { url } = await createBillingPortalSession({
      business: ctx.business,
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    });
    return { url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't open the billing portal." };
  }
}
