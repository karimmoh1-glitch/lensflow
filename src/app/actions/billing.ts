"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { createSubscriptionCheckout, createBillingPortalSession, changeSubscriptionPlan, subscriptionBillingIsLive } from "@/lib/subscriptionBilling";
import { PLANS, effectivePlan, type PlanKey } from "@/lib/billing";
import { track } from "@/lib/analytics";

const LIVE_SUBSCRIPTION_STATUSES = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

/** Only OWNER/ADMIN can change what the business pays Daythread. The role is read from the
 * session and the plan from the database — nothing about billing is trusted from the client. */
async function requireBillingRole(session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN"], session);
  if (!ctx) throw new Error("unauthorized");
  return ctx;
}

/**
 * Choose a plan → Stripe Checkout (new subscription) or an in-place, prorated change (a
 * live subscription). Returns a URL to send the browser to, or `changed` when Stripe
 * accepted the change and the webhook will land the new plan within seconds.
 */
export async function startUpgradeCheckout(
  planKey: Extract<PlanKey, "PRO" | "BUSINESS">,
  session?: SessionPayload | null
): Promise<{ url?: string; changed?: boolean; error?: string }> {
  if (planKey !== "PRO" && planKey !== "BUSINESS") return { error: "Unknown plan." };
  if (!subscriptionBillingIsLive) {
    return { error: "Upgrades aren't open on this deployment yet." };
  }

  const ctx = await requireBillingRole(session);
  const { business } = ctx;
  if (effectivePlan(business) === planKey && business.billingStatus && LIVE_SUBSCRIPTION_STATUSES.has(business.billingStatus) && !business.cancelAtPeriodEnd) {
    return { error: `You're already on ${PLANS[planKey].name}.` };
  }
  await track("upgrade_clicked", { businessId: business.id, properties: { planKey } });

  if (business.stripeSubscriptionId && business.billingStatus && LIVE_SUBSCRIPTION_STATUSES.has(business.billingStatus)) {
    try {
      await changeSubscriptionPlan({ business, planKey });
      revalidatePath("/dashboard/billing");
      await track("plan_changed", { businessId: business.id, properties: { planKey } });
      return { changed: true };
    } catch (err) {
      console.error("[billing] plan change failed", err instanceof Error ? err.message : err);
      return { error: "Couldn't change your plan. Please try again, or manage it from the billing portal." };
    }
  }

  try {
    const { url } = await createSubscriptionCheckout({
      business,
      ownerEmail: ctx.user.email,
      planKey,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?checkout=success&plan=${planKey.toLowerCase()}`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?checkout=canceled`,
    });
    await track("checkout_started", { businessId: business.id, properties: { planKey } });
    return { url };
  } catch (err) {
    console.error("[billing] checkout creation failed", err instanceof Error ? err.message : err);
    return { error: "Couldn't start checkout. Please try again." };
  }
}

/** The Stripe-hosted portal: card, invoices, plan switch, cancel. `flow` jumps straight to
 * updating the payment method (used from the failed-payment notice). */
export async function openBillingPortal(flow?: "payment_method", session?: SessionPayload | null): Promise<{ url?: string; error?: string }> {
  if (!subscriptionBillingIsLive) return { error: "Billing isn't configured on this deployment yet." };
  const ctx = await requireBillingRole(session);
  if (!ctx.business.stripeCustomerId) return { error: "No billing account yet — choose a plan first." };
  try {
    const { url } = await createBillingPortalSession({ business: ctx.business, returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`, flow });
    return { url };
  } catch (err) {
    console.error("[billing] portal failed", err instanceof Error ? err.message : err);
    return { error: "Couldn't open the billing portal. Please try again." };
  }
}
