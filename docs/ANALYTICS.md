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
| /start opened | `onboarding_started` (anonymousId, `source: start`) | `StartFlow` |
| Question answered | `onboarding_question_answered` (anonymousId, `step`, `values` option keys, `count`) | `StartFlow` — the name step sends `count` only |
| Setup skipped | `onboarding_skipped` (anonymousId, `step`) | `StartFlow` |
| Recommendation shown | `recommended_plan_shown` (anonymousId, `recommendedPlan`) | `StartFlow` summary |
| Recommendation chosen | `recommended_plan_selected` (anonymousId, `recommendedPlan`, `selectedPlan`; or businessId + `source: onboarding` from the welcome screen) | `StartFlow`, `notePlanChoice()` |
| Personalization done | `personalization_completed` (anonymousId, `seconds` since /start opened) | `StartFlow` |
| Signup started | `signup_started` (anonymousId, `personalized`) | `signup()` after validation |
| Signup completed | `signup_completed` (anonymousId, `method` password/google, `personalized`) | `signup()`, `completeGoogleSignIn()`, mobile signup |
| Workspace created | `workspace_created` | same |
| Profile saved | `personalization_created` / `personalization_updated` (anonymousId on the first, `source`, `recommendedPlan`, `selectedPlan`, `priorities`, `channelCount`, `businessStatus`, `userType`, `workCategory`, `usesBookings`, `usesTeam`) | `savePersonalization()` |
| Onboarding | `onboarding_started` (businessId, `personalized`), `onboarding_completed` (`connected`, `via` inbox/checkout), `onboarding_to_product` | onboarding page and actions |
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

The onboarding funnel, question by question — the `anonymousId` ties a /start visit to its signup, so drop-off per step and time-to-complete are both one query:

```sql
SELECT properties->>'step' AS step, COUNT(DISTINCT "anonymousId") AS answered
FROM "AnalyticsEvent" WHERE name='onboarding_question_answered' GROUP BY 1 ORDER BY 2 DESC;

SELECT
  (SELECT COUNT(DISTINCT "anonymousId") FROM "AnalyticsEvent" WHERE name='onboarding_started') AS started,
  (SELECT COUNT(DISTINCT "anonymousId") FROM "AnalyticsEvent" WHERE name='personalization_completed') AS finished_questions,
  (SELECT COUNT(DISTINCT "anonymousId") FROM "AnalyticsEvent" WHERE name='onboarding_skipped') AS skipped,
  (SELECT COUNT(*) FROM "AnalyticsEvent" WHERE name='signup_completed' AND (properties->>'personalized')='true') AS personalized_signups,
  (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (properties->>'seconds')::int) FROM "AnalyticsEvent" WHERE name='personalization_completed') AS median_seconds;
```

Which plan gets recommended, which gets chosen, and whether the recommendation converts:

```sql
SELECT properties->>'recommendedPlan' AS recommended, properties->>'selectedPlan' AS selected, COUNT(*)
FROM "AnalyticsEvent" WHERE name='recommended_plan_selected' GROUP BY 1, 2 ORDER BY 1, 2;
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
