# Daythread mobile

The app lives in `mobile/` — Expo (React Native) with expo-router. It is the same product
as the web dashboard on the same backend and database: every screen reads through
`/api/mobile/*`, which are thin bearer-token routes over the same server modules and
actions the web uses. No business logic is duplicated in the app.

## Decisions

| Concern | Decision |
| --- | --- |
| Stack | Expo SDK 57 / React Native, expo-router (file routes), TypeScript strict. Chosen over SwiftUI because the team is one TypeScript codebase, the backend contract is JSON over HTTPS, and Android comes for free. |
| Session | `POST /api/mobile/auth/login` and `/signup` return the same signed JWT the web uses (30 days, `sessionVersion` checked on every request). Stored in the iOS Keychain / Android Keystore via `expo-secure-store`. A 401 anywhere ends the session and the app returns to sign-in with "your session ended". |
| Tenant | The token carries the active business; every route re-derives membership from the database (`requireMobileBusiness` / `requireMobileRole`) and scopes every query by that business. Ids from another workspace return 404. |
| Cache / offline | `lib/cache.ts`: every read is remembered on the device (AsyncStorage). A screen opens with what it showed last time, refreshes, and when the network fails it keeps the cached copy with an "Offline — showing what loaded earlier" banner. Sends, bookings and deletions never use the cache. |
| Push | `expo-notifications`. After sign-in the device's Expo push token is registered on the membership (`OrgMembership.pushTokens`, up to 5 devices). The server pushes through Expo's push service when a person's message arrives (`src/server/push.ts`), with who and where — never the message. A token Expo reports unregistered is dropped. Sign-out removes the token. |
| Deep links | Scheme `daythread://`. Push payloads carry `data.path` (`/conversation/<id>`, `/booking/<id>`, `/person/<id>`); a tap routes there. Universal links need the Apple association file on the domain (not set up). |
| Theme | Light and dark are complete palettes (`lib/theme.ts`); every component reads `useTheme()`. Dynamic Type is on (RN default; large sizes capped at 1.3–1.4× where a label would break layout). Every control is ≥44pt and labelled for VoiceOver. |
| Errors | Loading (skeletons), empty (with the next step), error (message + retry), stale (banner + retry) states on every data screen. Server sentences are shown as written. |

## Screens

Today (while you were away, what to do next with the same engine as the web, today's and upcoming bookings) · Inbox (Priority / All, Waiting / Unread, search) · Conversation (cleaned messages, why it matters, facts, draft intents, send, per-message summary, follow-up, stage) · People (humans with evidence only) · Person (where we stand, timeline, merge candidates) · Calendar (14-day strip, agenda) · Booking (status moves, confirm, deliver) · Assistant · Automations (toggle) · Business memory · Channels · Team · Subscription · Account (delete workspace).

Connecting a channel, changing plans (Stripe), inviting team and editing automations open the web on purpose: they need a browser sign-in with the provider, or Stripe's own pages.

## Running it

```bash
cd mobile && npm install
echo "EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:3000" > .env   # or https://daythread.org
npx expo start            # Expo Go on a device, or a development build
```

## Building for TestFlight

Needs Xcode (not installed on the machine this was written on) or EAS Build, an Apple Developer account, and the bundle id `org.daythread.app` registered.

```bash
npm i -g eas-cli && eas login
cd mobile && eas build:configure          # creates eas.json, sets the EAS project id used for push
eas build --platform ios --profile production
eas submit --platform ios                 # uploads to TestFlight
```

Push in a store build additionally needs an APNs key uploaded to the EAS project (`eas credentials`).

## Verified here

Without Xcode, the app was exercised through Expo's web target in headless Chrome at 375/390/430 (`scratchpad/qa/mobile-qa.mjs`): sign-up with onboarding answers, Today with the away digest and next actions, the thread with an auto-draft, a human-edited send recorded honestly as not delivered without a channel, a per-message summary, follow-ups, inbox filters and search, People, a person's timeline, the calendar, the assistant, business memory, automations, subscription, channels, account, sign-out. Native gestures, push delivery, deep-link taps and the simulator were not verified.
