import { prisma } from "@/lib/db";

/**
 * Own-database funnel analytics. No third-party provider (PostHog, Segment, GA) is wired
 * up in this deployment — adding one is a real, separate decision (which provider, whose
 * account, what data-retention policy) that shouldn't get made silently as a side effect
 * of instrumenting events. This gives the same practical value for the one thing that
 * actually matters right now — seeing where the signup → paying-customer funnel drops off
 * — without inventing a dependency on a service nobody's configured.
 *
 * Canonical event names (keep this list authoritative — grep it before adding a new one):
 *   landing_cta_clicked, signup_started, signup_completed, onboarding_completed,
 *   module_selected, integration_connected, first_client_created, first_lead_created,
 *   first_booking_created, first_payment_created, pricing_viewed, upgrade_clicked,
 *   checkout_started, checkout_completed, subscription_canceled
 *
 * No PII beyond what's already in `properties` by the caller's own choice — never pass an
 * email, name, or raw message body here. A failed write never breaks the action it's
 * instrumenting (see the catch below) — a dropped analytics event is an acceptable loss,
 * a broken signup because analytics.track() threw is not.
 */
export async function track(name: string, opts: { businessId?: string; anonymousId?: string; properties?: Record<string, unknown> } = {}) {
  try {
    await prisma.analyticsEvent.create({
      data: { name, businessId: opts.businessId, anonymousId: opts.anonymousId, properties: opts.properties },
    });
  } catch (err) {
    console.error(`[analytics] failed to record "${name}"`, err);
  }
}
