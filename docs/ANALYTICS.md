# Funnel instrumentation

Every event is one row in `AnalyticsEvent` (`name`, `businessId`, `anonymousId`, `properties`,
`createdAt`), written by `track()` in `src/lib/analytics.ts`. Properties carry only ids,
plan keys, feature keys and sources — never message text, addresses, credentials or customer
data. Landing events carry a random per-visit id kept in the visitor's session storage; no
cookie, no IP, no fingerprint.

## The funnel

| Step | Event | Where |
| --- | --- | --- |
| Landing viewed | `landing_view` (anonymousId) | `LandingBeacon` |
| Start clicked | `landing_cta` (anonymousId, `source` = scene id) | `LandingBeacon` |
| Signup started | `signup_started` | `signup()` after validation |
| Signup completed | `signup_completed` (`method` password/google) | `signup()`, `completeGoogleSignIn()` |
| Workspace created | `workspace_created` | same |
| Onboarding | `onboarding_started`, `onboarding_completed` | onboarding actions |
| First channel | `first_channel_connected` (`provider`) | `activateIntegration()` — the only CONNECTED path |
| First conversation | `first_message_received` (`channel`) | ingestion |
| First reply | `first_reply_sent` (`channel`) | send reply |
| First AI action | `first_ai_action` (`via`: agent_approval) | agent approval |
| First booking | `first_booking_created` (`via`) | public booking, book from thread |
| First automation | `first_automation_created` | `createAutomation()` |
| Paywall | `paywall_shown` / `paywall_cta` / `paywall_dismissed` (`feature`, `source`, `plan`) | `Paywall` |
| Checkout | `checkout_started` (`planKey`, `interval`, `trial`, `source`) | `startUpgradeCheckout()` |
| Trial | `trial_started` (`planKey`) | Stripe webhook, first trialing sync |
| Subscription | `subscription_started` (`planKey`, `trial`), `plan_changed`, `subscription_canceled` | Stripe webhook |

## Answering the questions

Where do users drop off — count distinct workspaces per step in order:

```sql
SELECT name, COUNT(DISTINCT "businessId") AS workspaces
FROM "AnalyticsEvent"
WHERE name IN ('workspace_created','onboarding_completed','first_channel_connected','first_message_received','first_reply_sent','first_booking_created','first_ai_action','checkout_started','subscription_started')
GROUP BY name ORDER BY workspaces DESC;
```

Landing to signup — visits versus clicks versus signups:

```sql
SELECT
  (SELECT COUNT(DISTINCT "anonymousId") FROM "AnalyticsEvent" WHERE name='landing_view') AS visits,
  (SELECT COUNT(DISTINCT "anonymousId") FROM "AnalyticsEvent" WHERE name='landing_cta') AS clicked_start,
  (SELECT COUNT(*) FROM "AnalyticsEvent" WHERE name='signup_completed') AS signups;
```

Which paywall gets clicked:

```sql
SELECT properties->>'feature' AS feature, name, COUNT(*)
FROM "AnalyticsEvent" WHERE name LIKE 'paywall_%'
GROUP BY 1, 2 ORDER BY 1, 2;
```

Which feature leads to checkout — the `source` on `checkout_started` is `paywall:<feature>:<surface>` or `subscription`:

```sql
SELECT properties->>'source' AS source, COUNT(*) FROM "AnalyticsEvent" WHERE name='checkout_started' GROUP BY 1 ORDER BY 2 DESC;
```

How many reach first value (a reply or a booking), start a trial, convert:

```sql
SELECT
  (SELECT COUNT(DISTINCT "businessId") FROM "AnalyticsEvent" WHERE name IN ('first_reply_sent','first_booking_created')) AS first_value,
  (SELECT COUNT(DISTINCT "businessId") FROM "AnalyticsEvent" WHERE name='trial_started') AS trials,
  (SELECT COUNT(DISTINCT "businessId") FROM "AnalyticsEvent" WHERE name='subscription_started' AND (properties->>'trial') IS DISTINCT FROM 'true') AS paid_direct,
  (SELECT COUNT(DISTINCT "businessId") FROM "AnalyticsEvent" WHERE name='plan_changed' OR name='subscription_started') AS any_paid;
```

Events are append-only. There is no dashboard on purpose; these queries run against the
production database read-only.
