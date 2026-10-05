# Testing Turnproof on a Mac (iOS)

The iOS-only surfaces (the `Turnover` Live Activity and Dynamic Island, the `NextTurnover` home and
Lock Screen widgets, notification actions, camera capture with stamps) cannot be built on the
Windows dev box. This is the owner's checklist for a Mac with Xcode and an iPhone.

## What needs a paid Apple Developer account

| Feature | Free Apple ID (personal team) | Paid program ($99/yr) |
|---|---|---|
| App on your own iPhone via Xcode (7-day profile) | yes | yes |
| Camera capture, GPS stamp, sha256, local storage | yes | yes |
| Local reminders with Start / Snooze 30 min | yes | yes |
| Live Activity / Dynamic Island (`Turnover`) | yes | yes |
| Home / Lock Screen widget (`ExpoWidgetsTarget`, App Group `group.com.saadofficial.turnproof`) | **no**: App Groups need a paid team | yes |
| Push from the server (Expo push token) | no | yes |
| `eas build -p ios` (any profile), TestFlight | no | yes |

With a free team, temporarily remove the `expo-widgets` plugin entry from `apps/mobile/app.json`
to try everything else (the Live Activity lives in the widget extension, so it goes with it).

## One-time setup

1. Xcode 26+ from the App Store, then `xcode-select --install`; open Xcode once to install
   components. iPhone on iOS 17+ (Live Activities need 16.2+; the app targets 16.4), with
   **Developer Mode** on (Settings → Privacy & Security).
2. Node 24 and pnpm 12: `brew install node@24 && corepack enable && corepack prepare pnpm@12.8.1 --activate`.
3. CocoaPods: `brew install cocoapods`.
4. In Xcode → Settings → Accounts, sign in with the Apple ID / team you will sign with. Add the Team
   ID to `apps/mobile/app.json` as `"ios": { "appleTeamId": "XXXXXXXXXX", ... }` (the widget
   extension target is signed with it).

## Build and run on the device

```sh
git clone <turnproof repo url> turnproof
cd turnproof
pnpm install
cd apps/mobile
echo "EXPO_PUBLIC_API_URL=https://getturnproof.vercel.app" > .env.local   # or http://<mac-ip>:3900 for a local API
npx expo prebuild --platform ios                 # generates ios/ with ExpoWidgetsTarget
npx expo run:ios --device                        # pick the iPhone; first build ~10 min
```

If signing fails, open `ios/Turnproof.xcworkspace`, select both the `Turnproof` and
`ExpoWidgetsTarget` targets → Signing & Capabilities → choose your team (keep "Automatically manage
signing"), then re-run `npx expo run:ios --device`. On first launch trust the developer profile
(Settings → General → VPN & Device Management).

JS changes then hot-reload from `npx expo start`; re-run `expo run:ios` only after native changes
(a new native package or `app.json` plugin edits). Widget and Live Activity layouts are sent from
JS at runtime, so editing their TSX usually needs no rebuild.

### Alternative: EAS cloud build (paid account)

```sh
npx eas-cli@latest login
npx eas-cli@latest init                          # writes extra.eas.projectId (needed for push tokens)
npx eas-cli@latest device:create                 # register the iPhone (ad hoc)
npx eas-cli@latest build -p ios --profile development
```

Install from the link EAS prints, then `npx expo start`. EAS asks to create the App Group and the
widget extension bundle id (`com.saadofficial.turnproof.widgets`) on the first build; accept.

## Test script

Seed data first: from a dev screen or the JS console call `seedDemoData()` (from `@/data`). It
creates "Maple St Loft" (checkout about 70 minutes from now), "Harbour View Cottage" (tomorrow),
a third turnover in 3 days, and two finished turnovers with stamped sample photos (one with an issue).

### Camera capture and stamps
1. Allow the camera at the camera screen and location at the priming prompt ("While Using").
2. Start the Maple St turnover. In the first room take a **before** photo: the shutter haptic fires,
   the tile shows the stamp chip (time, coordinates ±accuracy, "Verified capture").
3. Check the stored file: Xcode → Window → Devices → the app container →
   `Documents/turnproof/photos/<id>.jpg` is ≤ 1600 px on the long edge. Open it in Preview →
   Tools → Show Inspector: no EXIF/GPS block (the stamp lives in the database, not the file).
4. Turn Location Services off and take another photo: it is saved within ~8 s without coordinates
   (stamp shows no location, the badge notes "No location recorded").
5. Import a library photo as a reference: it is labelled "Reference" and never counts towards the
   room's after-photo requirement.

### Reminders and notification actions
1. Allow notifications. With the default 60-minute lead the seeded Maple St reminder arrives about
   10 minutes after seeding: "Turnover at Maple St Loft in 1 h".
2. Long-press it: **Start** opens the app on `turnproof://turnover/<id>` with the turnover running;
   **Snooze 30 min** re-delivers it 30 minutes later. Repeat with the app killed: Snooze still applies.
3. Tap the notification body: the app opens on the turnover.

### Live Activity and Dynamic Island
1. Settings → Turnproof → Live Activities must be on.
2. Start a turnover with the app in the foreground: the `Turnover` activity appears with the property,
   the elapsed timer (native, keeps ticking while the app is suspended), the rooms ring (`0/5`) and
   "Room 1: Bedroom". On a Dynamic Island phone, go home: compact view shows the checklist icon and
   `0/5`; long-press for the expanded view.
3. Tap **Next room** on the Lock Screen: the current room advances (next incomplete room) and the
   activity updates. Tap **Issue**: the app opens with the issue sheet (`?issue=1`).
4. Complete a room in the app: the ring updates within a second or two.
5. Kill the app mid-turnover and relaunch: the same activity is adopted (no duplicate).
6. Finish the turnover: the activity ends.

### Widgets (paid team)
1. Home screen → + → Turnproof → add **Next turnover** small and medium; on the Lock Screen add the
   circular, rectangular and inline variants.
2. They show the next property, "Checkout 11:00" and a relative countdown, plus today's count; past
   checkout the small/medium widget shows "Overdue".
3. While a turnover runs, the circular Lock Screen widget shows its rooms ring.
4. Tapping a widget opens `turnproof://turnover/<id>` (or `turnproof://today` when nothing is scheduled).

### Proof link
1. Sign up on the phone, finish a turnover, tap Publish: photos upload (progress), then the link
   `https://getturnproof.vercel.app/p/<slug>` opens in Safari with before/after per room and the
   "verified capture" badges. Revoke it: the page stops resolving.
2. Airplane mode during upload: the queue pauses ("offline") and resumes when back online.

### PDF and CSV
1. A finished turnover → Share PDF: the share sheet shows a PDF with the summary, checklist and photos.
2. History → Export CSV: the share sheet offers `turnproof-history-<date>.csv`.

## Troubleshooting

- **Widget shows "Unable to load"**: open the app once (the first snapshot is pushed on launch);
  check the App Group exists on both targets.
- **No Live Activity**: Settings → Turnproof → Live Activities; it can only *start* while the app is
  in the foreground (no push-to-start in v0.1); Low Power Mode delays updates.
- **Notification actions do nothing**: rebuild after native changes; the categories are registered
  at launch (`setupNotifications`).
- **Photos never get coordinates**: Settings → Turnproof → Location must be "While Using" and
  Settings in the app must have "Stamp GPS" on.
- **`pod install` errors after pulling**: `cd apps/mobile && npx expo prebuild --platform ios --clean`.
