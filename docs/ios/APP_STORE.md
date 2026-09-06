# Daythread on iOS

## Where things stand

Daythread is a server-rendered Next.js app. There is no native project in the repository, and
this machine has only the Xcode Command Line Tools (no Xcode, no CocoaPods), so an Xcode
project could not be generated or built here. What exists and is verified:

- A web app manifest (`src/app/manifest.ts`), 180px Apple touch icon (`/apple-icon`), 512px
  maskable icon (`/pwa-icon`), `apple-mobile-web-app-capable`, viewport-fit=cover, safe-area
  padding on the tab bar and sheets. "Add to Home Screen" on iPhone opens Daythread
  standalone at `/dashboard`.
- Bearer-token mobile API under `/api/mobile/*` (login, signup, me, home, leads, bookings,
  integrations, agent, payments).
- Privacy policy `/privacy`, terms `/terms`, support `/support`, in-app account deletion
  (Settings → Profile → Delete workspace).

## Cleanest path to the App Store

Wrap the production site in Capacitor rather than rebuilding the UI natively. The app is
dynamic (server actions, OAuth callbacks, webhooks), so the shell points at
`https://daythread.org` instead of bundling static files.

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/splash-screen @capacitor/status-bar
npx cap init Daythread org.daythread.app --web-dir public-shell   # a folder with one index.html that redirects to /dashboard
npx cap add ios
npx cap sync ios
npx cap open ios
```

`capacitor.config.ts`:

```ts
import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "org.daythread.app",
  appName: "Daythread",
  webDir: "public-shell",
  server: { url: "https://daythread.org", cleartext: false, allowNavigation: ["daythread.org", "accounts.google.com", "checkout.stripe.com", "billing.stripe.com", "www.facebook.com", "www.instagram.com"] },
  ios: { contentInset: "automatic", scheme: "Daythread" },
  plugins: { SplashScreen: { launchShowDuration: 600, backgroundColor: "#FAFAF9" }, StatusBar: { style: "LIGHT" } },
};
export default config;
```

Xcode-side, before archiving:

1. Signing: team, bundle id `org.daythread.app`, automatic provisioning.
2. Icons: export the mark on `#101114` at 1024×1024 into the asset catalog (same artwork as
   `/apple-icon`). Launch screen: solid `#FAFAF9` with the mark.
3. Info.plist: no camera/contacts/location keys — the app requests none. Add
   `NSAppTransportSecurity` only if a non-HTTPS host is ever needed (it isn't).
4. Universal links: add `applinks:daythread.org` under Associated Domains and serve
   `/.well-known/apple-app-site-association` (not yet added; needs the Team ID).
5. Open OAuth (Google, Meta) in the system browser (`@capacitor/browser`), never in the web
   view — Google blocks embedded web views for sign-in.

## App Store Connect

- **Name**: Daythread. **Subtitle**: All your clients. One thread.
- **Category**: Business. **Age**: 4+.
- **Description** (draft): Daythread brings your client conversations, calendar, bookings and
  payments into one place and tells you what to do next. Connect Gmail, Google Calendar,
  Apple Calendar, Instagram, WhatsApp and SMS; see who is waiting on you; book from a thread;
  get paid; let automations handle confirmations and reminders. Business plans add the
  Daythread Business Agent, which proposes the day's work and carries it out when you approve.
- **Privacy URL**: https://daythread.org/privacy. **Support URL**: https://daythread.org/support.
  **Terms**: https://daythread.org/terms.
- **In-app purchases**: subscriptions are sold on the web through Stripe. Under guideline
  3.1.3(b) (multiplatform services) the app must not link to or mention external purchase
  from inside the iOS app unless the reader-app / external-link entitlement applies. Keep
  the Billing page reachable but expect to hide "Upgrade" buttons in the iOS build (detect
  the Capacitor platform) or adopt StoreKit. This is the one product decision still open.
- **Reviewer notes** (draft): Demo account — provide a test login on request. The app is a
  native shell around our production service; all features work on a fresh account without
  connecting third-party integrations. Account deletion: Settings → Profile → Delete
  workspace. No push notifications, camera, or location are used.
- **Privacy nutrition labels**: Contact info (name, email), User content (messages), Purchases
  (via web), Identifiers (none), Usage data (first-party analytics only).

## Remaining human steps

1. Install Xcode and CocoaPods on the build machine.
2. Run the commands above; open the project; set signing.
3. Decide the subscription approach for iOS (hide upgrade in-app vs StoreKit).
4. Archive → Distribute → App Store Connect → TestFlight → Submit.

## Checklist snapshot (2026-09-06)

| Item | State |
|---|---|
| Xcode project | none in repo; this Mac has Command Line Tools only |
| Capacitor | not installed (config drafted above) |
| Signing | not set up (needs Apple Developer team) |
| Bundle identifier | proposed `org.daythread.app` |
| Display name | Daythread |
| App icons | 180px and 512px generated at `/apple-icon` and `/pwa-icon`; 1024px App Store icon to export from the same mark |
| Splash / launch | solid `#FAFAF9` with the mark (drafted) |
| Associated domains | `applinks:daythread.org` — needs Team ID and `/.well-known/apple-app-site-association` |
| Push notifications | none; no notification architecture in the app today |
| Privacy URL / Terms / Support | live: `/privacy`, `/terms`, `/support` |
| Account deletion in app | Settings → Profile → Delete workspace |

## TestFlight checklist

1. Archive in Xcode with the Release scheme; Distribute → App Store Connect → Upload.
2. App Store Connect → TestFlight → add internal testers; fill Export Compliance (no
   custom encryption; HTTPS only).
3. Install on a real iPhone; verify: login persists across relaunch, standalone
   navigation, Google OAuth opens in the system browser and returns, sheets and keyboard
   behavior, calendar day view, booking detail reschedule sheet, inbox composer.
4. Fix anything found, re-upload, then submit for review with the reviewer notes above.
