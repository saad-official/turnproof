# Mobile data layer and native adapters: API for screens

Everything a screen needs from storage, the account API or the OS. Screens and components import
only from `@/data`, `@/hooks/use-*` and `@/native/*`; never from `expo-sqlite`, `drizzle-orm`,
`expo-camera`'s capture pipeline, `expo-notifications`, `expo-widgets`, `expo-live-updates`, etc.
(The UI renders `<CameraView>` itself and hands its ref to `takeProofPhoto`.)

Domain types (`Property`, `Room`, `ChecklistItem`, `Turnover`, `RoomState`, `Photo`, `Stamp`,
`Issue`, `Proof`, `Settings`, …) and pure rules come straight from `@turnproof/shared`:
`roomProgress`, `turnoverProgress`, `stampLabel(stamp, tz, locale)`, `stampIsVerified(stamp, turnover, { stampGps })`,
`countdownLabel`, `formatMinutes`, `groupByDay` (generic: any items with a `scheduledFor`, e.g. `TurnoverView[]`;
returns `{ dayKey, turnovers }[]`), `proofState`, `latestProofState`, `ROOM_TEMPLATES`, `DEFAULT_SUPPLIES`, tokens.

**Hooks vs plain functions.** Everything named `use*` is a React hook (`@/hooks/use-*`;
`useDatabaseMigrations`, `useToday`, `useClockTick`, `useSecondTick`, `useStore` come from `@/data`).
Everything else exported from `@/data` and `@/native/*` is a plain function (sync reads or `async`
actions) that is safe in event handlers, background tasks and headless code.

Conventions: row ids are UUIDv7 strings; room and checklist-item ids are short free-form strings
(they live as JSON inside the property row); timestamps are ISO-8601 UTC; local days are
`YYYY-MM-DD` in the device zone; deletes are soft (`deletedAt`) so they sync. `scheduledFor` is the
checkout instant (shared `turnoverWindow(property, dayKey, tz).checkoutAt`).

## 1. Root layout wiring (once)

```tsx
// src/app/_layout.tsx
import { useEffect } from 'react';
import { router } from 'expo-router';
import { useDatabaseMigrations } from '@/data';
import { startNativeServices } from '@/native/surface-sync';

export default function RootLayout() {
  const db = useDatabaseMigrations();                    // { success, error? }
  useEffect(
    () => (db.success ? startNativeServices({ onOpenUrl: (url) => router.push(url) }) : undefined),
    [db.success],
  );
  if (db.error) return <DatabaseErrorScreen error={db.error} />;
  if (!db.success) return null;                          // keep the splash screen up
  return <Tabs />;
}
```

- `apps/mobile/index.ts` is the JS entry (`package.json` `main`). It imports `src/native/entry.ts`
  before `expo-router/entry`: background task definitions (`TURNPROOF_DAILY`, Android notification
  actions), the Android widget task handler and the notification / Live Activity action listener
  live at module scope so headless launches work without rendering the layout. Do not move them.
- `startNativeServices({ onOpenUrl? })`: migrate → notification channels + categories → register
  background tasks → reminders + Live Activity / Live Update + widgets → start the photo upload
  queue → (signed in) sync, shared-property memberships, push token. While mounted it re-runs
  maintenance on every foreground and at local midnight, and forwards taps to `onOpenUrl`
  (including the one that cold-launched the app). Returns a cleanup function.
- Data hooks return empty fallbacks (`[]`, `null`, `DEFAULT_SETTINGS`) until migrations finish.

### Deep links the app must route

| URL | From | Route to |
|---|---|---|
| `turnproof://turnover/<id>` | reminder tap, "Start" action, Live Activity / Live Update tap, widget tap | the turnover (scheduled → detail with Start; running → the camera-first flow) |
| `turnproof://turnover/<id>?issue=1` | Live Activity "Issue", ongoing-notification "Issue" | the running turnover with the issue sheet open |
| `turnproof://today` | widget with nothing scheduled, generic pushes | Today tab |

Expo Router resolves these to `src/app/turnover/[id].tsx` and `src/app/today…` (or redirect in
`+native-intent.tsx`); `useLocalSearchParams()` gives `{ id, issue }`.

## 2. Hooks (reactive reads)

`useSyncExternalStore`-based: re-render only when a table they read is written (or their clock
ticks). Results are referentially stable between changes.

| Hook | Returns | Example |
|---|---|---|
| `useProperties()` (`@/hooks/use-properties`) | `Property[]` by name (rooms with items, supplies) | `const properties = useProperties();` |
| `useProperty(id)` | `Property \| null` (deleted ones too: check `deletedAt`) | `const p = useProperty(params.id);` |
| `useUpcomingTurnovers(days = 7)` (`@/hooks/use-turnovers`) | `TurnoverView[]` (shared `upcomingTurnovers`: today … +days, overdue-today and running included), 30 s tick | `const list = useUpcomingTurnovers(); groupByDay(list, tz)` |
| `useTurnover(id, { everySecond? })` | `TurnoverView \| null` with live `progress` (shared `turnoverProgress`), `rooms[]` (per-room `roomProgress` + `current`, `doneAt`), `elapsedSeconds`, `countdown`, `overdue`, `property` | `const t = useTurnover(id, { everySecond: true }); t?.progress?.roomsDone` |
| `useActiveTurnover({ everySecond? })` | the turnover running **on this device** (what the Live Activity shows) | `const active = useActiveTurnover();` |
| `useTurnoversBetween(from, to, propertyId?)` | `TurnoverView[]` in `[from, to)` | `useTurnoversBetween(monthStart, nextMonthStart)` |
| `useTurnoverSummaries(range, propertyId?)` | list rows for `[range.from, range.to)`, by time: `{ turnover: TurnoverView, property, photosCount, issuesCount, proofState: 'active' \| 'expired' \| 'revoked' \| 'none' }[]`. Local tables only: counts are grouped queries, `proofState` is shared `latestProofState` over the cached `proofs` rows (newest first; `active` while any link is live); no network. Used by History (month) and Properties (next turnover per property) | `useTurnoverSummaries({ from: monthStart, to: nextMonthStart })` |
| `usePhotos(turnoverId, roomId?)` (`@/hooks/use-photos`) | `LocalPhoto[]` = `Photo & { uploadState, uploadAttempts, uploadError, nextAttemptAt }`; `roomId` omitted = all, `null` = no room | `<Image source={{ uri: p.localUri ?? p.remoteUrl }} />` (expo-image; thumbnails are rendered, not stored) |
| `usePhoto(id)` (`@/hooks/use-photos`) | `LocalPhoto \| null` (null when missing or deleted) | `const photo = usePhoto(params.id);` |
| `useIssues(turnoverId, roomId?)` (`@/hooks/use-issues`) | `Issue[]` | `const issues = useIssues(t.id);` |
| `useProofs(turnoverId)` (`@/hooks/use-proofs`) | `{ proofs: (ProofLink & { state })[], current, refreshing, error, refresh() }`; refreshes from the server on mount, so use it on one turnover's screen, not per list row (lists: `useTurnoverSummaries`) | `const { current } = useProofs(t.id); current?.url` |
| `useSettings()` (`@/hooks/use-settings`) | `Settings` (`onboarded, role, reminderLeadMinutes, stampGps, displayName?, appearance: 'system' \| 'light' \| 'dark'` (default `system`; the theme provider applies it), `proofExpiryDays` 1–365 (default 60; `publishProof`'s default)) | `const { stampGps, appearance } = useSettings();` |
| `useSession()` (`@/hooks/use-session`) | Better Auth `{ data, isPending, error, refetch }` | `const { data: session } = useSession();` |
| `usePropertyMembers(propertyId)` (`@/hooks/use-property-members`) | `{ members, role, inviteCode, loading, error, refresh() }` (cached offline) | `const { inviteCode, members } = usePropertyMembers(p.id);` |
| `useSyncStatus()` (`@/hooks/use-sync-status`) | `{ running, lastSyncAt, error }` | |
| `useUploadQueue()` (`@/hooks/use-upload-queue`) | `{ running, paused: 'offline' \| 'signed-out' \| null, current, counts: { local, uploading, uploaded, failed }, pending, lastError, kick(), retry() }` | `q.pending ? \`${q.pending} photos to upload\` : null` |
| `useDatabaseMigrations()`, `useToday()`, `useClockTick()`, `useSecondTick()` (`@/data`) | ready state / local day / 30 s tick / 1 s tick | |

## 3. Actions (`@/data`, `src/data/actions.ts`)

Each applies the shared state machine, stamps `updatedAt`, persists synchronously, then refreshes
reminders, the Live Activity / Live Update and widgets, and schedules a sync. Turnover actions
return `TurnoverActionResult = { ok: true, turnover, events } | { ok: false, reason, turnover, incompleteRoomIds? }`
where `reason` (`ActionFailure`) is a shared `TransitionReason` (`not-in-progress`, `room-incomplete`,
`rooms-incomplete`, `note-required`, `gallery-not-proof`, …), `not-found`, `in-progress`
(`deleteTurnover` of a running turnover) or `undo-expired` (`restoreTurnover` too late).
Copy for every reason: `turnoverFailureMessage(reason)` in `src/constants/messages.ts`.

| Action | Notes / example |
|---|---|
| `createProperty(input)` | `{ name, address?, lat?, lng?, checkoutTime = '11:00', checkinTime = '16:00', accessNotes?, fromTemplate = true \| RoomKind[] \| false, rooms?, supplies? }`; rooms from shared `ROOM_TEMPLATES`. `await createProperty({ name: 'Maple St', fromTemplate: ['bedroom', 'bathroom', 'kitchen'] })` |
| `updateProperty(id, patch)` | any of name, times, notes, `rooms` (edited array), `supplies`. Helpers: `newRoom(kind, name?)`, `newChecklistItem(label, required?)` |
| `deleteProperty(id)` | soft delete + its scheduled turnovers |
| `scheduleTurnover(propertyId, scheduledFor)` | ISO instant or `'YYYY-MM-DD'` (→ that day's checkout). `rescheduleTurnover(id, …)` |
| `deleteTurnover(id)` | scheduled, finished or abandoned: soft-deletes the turnover and its live photo and issue rows with one `deletedAt` (they sync). Refuses `in-progress` (abandon first) and `not-found`. For `TURNOVER_UNDO_MS` (10 s, longer than the 6 s undo toast) nothing irreversible happens; when the window closes a live proof link is revoked (signed in, best effort) and the photo files are removed. If the app dies inside the window, `runMaintenance` finishes the job (`finalizeDeletedTurnovers`, which also cleans files of turnovers deleted on another device). |
| `restoreTurnover(id)` | Undo inside the window: clears `deletedAt` on the turnover and on the photo / issue rows deleted with it (earlier retakes stay deleted), re-kicks uploads. `undo-expired` after the window; a live turnover is returned as is. `showToast({ message: 'Turnover deleted', actionLabel: 'Undo', onAction: () => void restoreTurnover(id) })` |
| `startTurnover(id)` | scheduled → in-progress on this device; Live Activity / Live Update start |
| `toggleItem(turnoverId, roomId, itemId)` | unchecking in a done room reopens it |
| `capturePhoto(turnoverId, roomId, phase, captureResult)` | stores a `takeProofPhoto` / `importReferencePhoto` result. `before`/`after` attach to the room (camera only, turnover running); `reference` for gallery imports; returns `{ ok, photo, turnover } \| { ok: false, reason }` (file deleted on refusal). Starts the upload queue. |
| `deletePhoto(photoId)` | retake: detaches (may reopen the room), deletes the file |
| `discardCapture(captureResult)` | sync; deletes the file of a `takeProofPhoto` / `importReferencePhoto` result that will not be stored (sheet closed, photo replaced). Null-safe. Never call `deletePhotoFile` from screens. |
| `completeRoom(turnoverId, roomId)` | refuses `room-incomplete`; then jumps to the next incomplete room |
| `goToRoom(turnoverId, index)` / `goToNextRoom(turnoverId)` | `goToNextRoom` = Live Activity "Next room" |
| `addIssue(turnoverId, { roomId?, severity, note?, photo? })` | `photo` = a `takeProofPhoto` result (stored as an `issue` photo). `updateIssue(id, patch)`, `deleteIssue(id)` |
| `finishTurnover(id, { force?, note? })` | `rooms-incomplete` (+ `incompleteRoomIds`) unless `{ force: true, note }` |
| `abandonTurnover(id, note?)` | |
| `publishProof(turnoverId, { onProgress?, fresh?, expiresInDays? (default `Settings.proofExpiryDays`), signal? })` | uploads photos → pushes rows → `POST /api/proofs` → `{ ok: true, url, proof, reused } \| { ok: false, reason: 'not-finished' \| 'signed-out' \| 'offline' \| 'upload-failed' \| 'sync-failed' \| 'server' \| 'not-found', message?, failedUploads? }`. Reuses a live link unless `fresh`. |
| `revokeProof(proofId)` | the page stops resolving |
| `updateSettings(patch)` | validated; a `reminderLeadMinutes` change re-plans reminders. `updateSettings({ appearance: 'dark' })`, `updateSettings({ proofExpiryDays: 30 })` |
| `leaveProperty(propertyId, { force? })` | leave a shared property; purges its local copy (refuses `pending-uploads` unless `force`) |
| `deleteAllLocalData()` | wipes every table and photo file, cancels reminders, clears surfaces |
| `seedDemoData()` | **dev only**: 2 properties, a turnover due in ~70 min (reminder in ~10 min), two upcoming, two finished with ~20 stamped sample JPEGs and an issue |

Plain reads (headless or one-off): `getProperty`, `listProperties`, `getTurnover`,
`listTurnoversBetween`, `listAllTurnovers`, `getActiveTurnover`, `turnoverView`,
`upcomingTurnoverViews`, `listPhotos`, `listIssues`, `listProofs`, `currentProof`, `getSettings`.

## 4. Capture flow (`@/native/capture`)

```tsx
const cameraRef = useRef<CameraView>(null);
const settings = useSettings();

async function onShutter() {
  haptics.shutter();
  try {
    const shot = await takeProofPhoto(cameraRef);          // CaptureResult
    const r = await capturePhoto(turnover.id, room.id, phase, shot);
    if (!r.ok) showError(r.reason);
  } catch (e) {
    if (e instanceof CaptureError) showError(e.code);      // 'no-camera' | 'capture-failed' | 'processing-failed'
  }
}
```

`takeProofPhoto(cameraRef, { stampGps? })`:
1. starts one location fix in parallel (only when `settings.stampGps` and when-in-use permission is
   granted; `Accuracy.Balanced`, 8 s cap, omitted on failure / timeout),
2. `takePictureAsync({ quality: 0.85, exif: false })`; `takenAt` = shutter time,
3. re-encodes with expo-image-manipulator, long edge ≤ 1600 px, JPEG 0.85 — this re-encode strips
   EXIF; the camera's temp file is deleted,
4. moves the result to `<documentDirectory>/turnproof/photos/<id>.jpg`,
5. sha256 (expo-crypto `digest`) over **those exact bytes** (the same file is uploaded), lower-case hex,
6. returns `{ id, localUri, width, height, stamp: { takenAt, lat?, lng?, accuracyM?, deviceModel, sha256, source: 'camera' } }`.

`importReferencePhoto()` (expo-image-picker, no permission prompt on modern OSes) runs the same
resize / strip / hash with `source: 'gallery'`, no GPS, `takenAt` = import time; store it with
`capturePhoto(…, 'reference', result)`. It never counts as proof and is labelled "Reference".
Location permission UI: `getLocationPermission()`, `requestLocationPermission()` (call from a
priming screen). Camera permission: `useCameraPermissions()` from expo-camera in the camera screen.

## 5. Account, sharing, sync and proofs (`@/data`)

| Function | Notes |
|---|---|
| `signInAndSync({ email, password })` / `signUpAndSync({ name, email, password })` | Better Auth (`expoClient`, scheme `turnproof`, cookie prefix `turnproof`, SecureStore), then sync + memberships + push token + uploads. Returns an error message or `null`. |
| `signOutAndForget()` / `deleteAccountEverywhere(password)` | local data stays; uploads pause |
| `shareProperty(propertyId)` | host: pushes the property, `POST /api/properties/:id/share` → invite code (stored on the property). Rejects with `PropertyClientError` |
| `joinProperty(code)` | cleaner: `POST /api/properties/join`, then sync pulls the property and its schedule. Rejects with `PropertyClientError` |
| `refreshSharedProperties()` / `rotateInviteCode(id)` / `removePropertyMember(id, userId \| 'me')` | memberships |
| `syncNow()` / `scheduleSync()` / `pendingPushCount()` | push dirty rows then pull (signed in). Never throws; see `useSyncStatus()` |
| `kickUploadQueue()` / `retryFailedUploads()` / `uploadTurnoverPhotos(id, { onProgress })` | photo uploads (see 7) |
| `createProof`, `refreshProofs`, `revokeProofLink` | low level; prefer `publishProof` / `revokeProof` |

API base URL: `EXPO_PUBLIC_API_URL` (e.g. `http://192.168.1.20:3900`), default
`https://getturnproof.vercel.app`. Errors are `ApiError { status, message, code? }` (status 0 = network),
except `joinProperty` / `shareProperty`, which reject with
`PropertyClientError { code, message, status? }`:

| `code` | When |
|---|---|
| `invite_not_found` | join: 404 (no property uses the code) |
| `already_member` | join: 409 |
| `offline` | no connection or timeout (`ApiError` status 0) |
| `unauthorized` | 401 (signed out / session expired) |
| `server` | anything else; `message` is the server's text |

UI copy: `propertyErrorMessage(error, fallback)` in `src/constants/messages.ts`.

## 6. Native adapters (`@/native/*`)

| Module | API |
|---|---|
| `capture` | `takeProofPhoto`, `importReferencePhoto`, `CaptureError`, `getLocationPermission`, `requestLocationPermission`, `oneLocationFix`, `sha256OfFile`, `deviceModelLabel`, constants `MAX_PHOTO_EDGE = 1600`, `PHOTO_QUALITY = 0.85`, `LOCATION_TIMEOUT_MS = 8000` |
| `notifications` | `requestNotificationPermission()`, `getNotificationPermission()`, `openNotificationSettings()`, `rescheduleAll()`, `snoozeTurnoverReminder(id, 30)`, `cancelAllTurnoverNotifications()`, `getPushRegistration()`. Channel **`turnovers`** (reminders, high), `turnover-live` (silent in-progress status, shared with expo-live-updates). iOS/Android category **`turnover`** with **`start`** (opens app) / **`snooze-30`**; `turnover-live` with `next-room` / `issue`. Reminders at shared `reminderAt(turnover, property, reminderLeadMinutes, tz)`: "Turnover at Maple St in 1 h", rolling 14 days. `turnoverUrl(id)`, `TODAY_URL`. |
| `live-status` (`.ios` / `.android` / default) | `syncTurnoverStatus(view \| null)`, `addStatusActionListener(e => …)` with `e = { action: 'next-room' \| 'issue' \| 'start' \| 'snooze', turnoverId, source }`. iOS Live Activity **`Turnover`**: property, native elapsed timer, rooms done/total ring, current room, Button **`next-room`** and an **Issue** link (`turnproof://turnover/<id>?issue=1`). Android 16 Live Update: one progress segment per room, chip `2/5`, chronometer; ongoing notification with Next room / Issue below 16. Actions are applied by `native/entry.ts`; listen only for UI feedback. |
| `widgets` | `refreshWidgetsFromDatabase()`; iOS **`NextTurnover`** (systemSmall/Medium: property, checkout time, relative countdown, today's count; accessoryCircular: rooms ring while running, else today's count; accessoryRectangular / Inline), timeline entries at checkouts and midnight. Android `NextTurnover` 2×2 (react-native-android-widget + headless task handler). |
| `haptics` | `shutter()`, `toggle()`, `roomDone()`, `roomChange()`, `started()`, `finished()`, `issue()`, `selection()`, `warning()`, `error()` |
| `exports` | `shareTurnoverPdf(turnoverId)` / `buildTurnoverPdf` (expo-print from shared `turnoverPdfModel`, photos embedded from this device), `shareHistoryCsv({ propertyId? })` / `buildHistoryCsv` (shared `toCsvRows` + `toCsv`) → `{ ok, uri } \| { ok: false, reason }` |
| `background` | `DAILY_TASK = 'TURNPROOF_DAILY'` (sync, reschedule, widgets, status, upload kick), `triggerDailyTaskForTesting()` |
| `photo-files` | `photosDirectory()`, `availableDiskBytes()` (warn before a long turnover) |
| `surface-sync` | `startNativeServices(opts)`, `initializeNativeServices()`, `syncNativeSurfaces()`, `runMaintenance()` |

## 7. Upload queue (`src/data/upload-queue.ts`)

Sequential and resumable; state lives in `photos.upload_state` (`local → uploading → uploaded | failed`).
Pauses while offline (expo-network listener resumes it) and while signed out (resumes after sign-in).
Failures back off 15 s × 2ⁿ up to 1 h; 409 / 413 / 422 wait a day (UI "Retry" clears backoff).
A row left `uploading` by a killed app is reset at start. Proof publishing calls
`uploadTurnoverPhotos` which ignores backoff for that turnover.

## 8. API contract the app expects (apps/web)

All JSON unless noted; auth = Better Auth session cookie (`turnproof.session_token`).

| Method + path | Body → response |
|---|---|
| `POST /api/sync/push` | shared `SyncPushRequestSchema` (`{ deviceId, tables: { properties, turnovers, photos, issues } }`; photo rows have `localUri: null`) → `{ serverTime, accepted }` |
| `GET /api/sync/pull?since=` | → shared `SyncPullResponseSchema`; rows the caller may see (own + shared properties) |
| `POST /api/photos/:id/upload` | raw JPEG bytes, `content-type: image/jpeg`, `x-content-sha256: <hex>` → `{ remoteUrl }`. 404 `photo_not_found` when the row is not synced yet (the app pushes and retries once); 409 `hash_mismatch`; 413 too large. Idempotent. |
| `POST /api/proofs` | `{ turnoverId, expiresInDays }` → `{ proof: Proof & { url? } }` (409 `turnover_not_finished`, `photos_missing`) |
| `GET /api/proofs?turnoverId=` | → `{ proofs: (Proof & { url? })[] }` |
| `DELETE /api/proofs/:id` | → `{ proof }` (revoked) |
| `GET /api/properties` | → `{ properties: { propertyId, name, role: 'host' \| 'cleaner', inviteCode \| null, members: { userId, name, role, joinedAt, isMe }[] }[] }` |
| `POST /api/properties/:id/share` | → `{ property: <same view> }` with `inviteCode` |
| `POST /api/properties/:id/invite` | → `{ inviteCode }` (rotates) |
| `POST /api/properties/join` | `{ code }` → `{ property }` (404 `invite_not_found`, 409 `already_member`) |
| `DELETE /api/properties/:id/members/:userId` | `userId` may be `me` |
| `POST /api/devices` / `DELETE /api/devices/:token` | `{ token, platform }` (Expo push) |

## 9. Storage notes

- Tables: `properties` (`rooms_json`, `supplies_json`), `turnovers` (`room_states_json`), `photos`
  (`stamp_json`, `local_uri`, `remote_url`, `upload_state`, `upload_attempts`, `upload_error`,
  `next_attempt_at`), `issues`, `proofs` (server-owned cache), `settings` (one JSON value per shared
  `Settings` key, including `appearance` and `proofExpiryDays`; `app.*` keys are device-local: device id,
  push token, last sync, memberships, `localRuns`), `sync_state`. The old `app.ui.appearance` /
  `app.ui.proofExpiryDays` values are moved into the typed keys once, right after migrations. Schema `src/data/schema.ts`; migrations in `apps/mobile/drizzle/`
  (`pnpm --filter mobile db:generate` after a schema edit; `.sql` inlined by babel-plugin-inline-import).
- The database is plain SQLite (not encrypted): checklists and photo metadata; the photos are files.
- Photos: `<documentDirectory>/turnproof/photos/<id>.jpg`, ≤ 1600 px, no EXIF.
- Icons: `pnpm --filter mobile icons` regenerates `assets/icons/*` and the widget preview from the
  shared tokens.

## 10. Known gaps

- No push-to-start / APNs updates for the Live Activity: it starts and updates while the app runs
  (foreground, notification actions, background task); the elapsed timer ticks natively regardless.
- Android Live Updates (expo-live-updates 0.1) have no action buttons; Next room / Issue are on the
  ongoing notification used below Android 16 and inside the app.
- The Android widget countdown is as of its last refresh (≤ 30 min, plus every app write).
- No clipboard API: proof links and invite codes are copied by long-pressing selectable text or
  through the share sheet (adding `expo-clipboard` is a dependency change).
- The photo viewer (`photo/[id]`) has no pinch-zoom or pan; it shows the photo at screen width.
- Issues cannot be edited in the UI yet: `updateIssue(id, patch)` exists, but the sheet only adds
  new issues (delete and re-report to change one).
- Rooms cannot be drag-reordered in the property editor; they move with the up / down buttons.
- No server push of data changes yet: another member's edits (a host's schedule, a cleaner's
  turnover) arrive on the next sync (launch, foreground, after local writes, daily background
  task), not instantly. Devices register an Expo push token, but the server sends no pushes
  yet (reminders are local notifications).
- Deleting a turnover revokes its proof link only when the undo window closes while signed in;
  offline or signed out, the link stays live until the next maintenance run that can reach the
  server, or until it expires.
