# Turnproof — product and technical spec (batch 4, app 13)

Date: 2026-10-06. Free app. Copied into the `turnproof` repo as `docs/spec.md`.

## 1. Problem and users

Solo cleaners and small short-term-rental hosts (1–5 units) lose money to "it wasn't clean" and damage disputes. The evidence that wins is a set of timestamped before/after photos per room; Airbnb's 2026 damage policy (section 3.3.3) lets it deny evidence that is AI-generated or cannot be verified, and AirCover claims must be filed within 14 days of checkout. Incumbents (Turno, Breezeway, TurnFlow from $79/mo, Properly) are host-side scheduling platforms or marketplaces; the cleaner doing the work has a paper checklist and a camera roll.

**Turnproof** is a free, cleaner-first turnover app: a room-by-room checklist with camera-captured before/after photos stamped with time and location, a Live Activity showing the turnover in progress, and a proof link the host can open in a browser.

## 2. Scope (v0.1)

- Properties: name, address, rooms (templated: bedroom, bathroom, kitchen, living, entry, outdoor; editable), per-room checklist items, supplies to restock, access notes, checkout/check-in times.
- Turnover: start → per room: "before" photos (camera only, no gallery import for proof photos), checklist items, "after" photos, issue/damage report (photo + note + severity) → finish → summary (duration, rooms, items, issues, photos).
- **Proof stamping**: capture time, device, GPS coordinates (when permitted) and a content hash per photo; stored in the photo's record and on the proof page; gallery imports are allowed only as "reference" photos, clearly labelled.
- **Live Activity / Live Update**: property, elapsed time, rooms done/total, current room; buttons "Next room" and "Issue". Widgets: next turnover (property, checkout time, countdown) and today's turnovers; Lock-Screen circular with rooms progress.
- Schedule: turnovers list by date; reminders before checkout time ("Turnover at Maple St in 1 h"); overdue badge.
- Proof link: when signed in, finishing a turnover uploads photos (resized, EXIF stripped except the stamp we display) and publishes `getturnproof.vercel.app/p/<id>` — a read-only page with before/after per room, issues, timestamps and a "verified capture" badge; link expires in 60 days by default, revocable; host doesn't need an account.
- History: per property, per month; CSV export of turnovers; PDF of a single turnover.
- Team (light): a host can create a property and share an invite code with their cleaner; both see the schedule; cleaner's turnovers appear on the host's phone.
- Free, no ads.

Out of scope: calendar sync (iCal) for v0.1 (listed as next), payments, marketplace, messaging.

## 3. Architecture

Same monorepo shape as Dosely.

### Domain (`packages/shared`)
- `checklist.ts`: room templates, progress math, completion rules (a room is done when all required items are checked and ≥1 after photo exists).
- `turnover.ts`: state machine (`scheduled → inProgress(roomIndex) → finished|abandoned`), elapsed, rooms done, next room.
- `stamp.ts`: proof stamp model (`takenAt`, `lat/lng` optional, `accuracyM`, `deviceModel`, `sha256`), `verifyStamp` rules for the badge (camera-captured, hash matches, time within turnover window).
- `schedule.ts`: upcoming turnovers, reminder times, DST-safe; `countdownLabel`.
- `report.ts`: proof page and PDF view models; `sync.ts`, `ids.ts`, `tz.ts`, `csv.ts`.

### Mobile
Tabs: Today · Properties · History · Settings; full-screen Turnover flow (camera-first). Identity: "fresh linen" — off-white surfaces (`#FAF8F4` light / `#121417` dark), deep green accent (`#1F6B4A`), coral for issues, soft shadows, rounded photo tiles with stamp chips; motion: room-to-room slide, shutter haptics. Native: expo-camera (capture with stamp overlay), expo-location (one fix per photo), expo-crypto (sha256), expo-image for thumbnails, file-system for local storage, notifications (`turnover` category), expo-widgets `NextTurnover` + `Turnover` Live Activity, expo-live-updates, react-native-android-widget, SQLite (Drizzle), expo-print/sharing.

### Backend (`apps/web`)
Landing (problem: disputes, 2026 policy, proof link demo), `/p/[id]` public proof page (SSR, noindex, expiring), privacy, support, terms. API: Better Auth, `properties` (create/join via code), `turnovers` (sync), `photos` (signed upload to Vercel Blob? — free Hobby Blob has 1 GB; fall back to Neon `bytea` for small resized photos if Blob is unavailable; decide at build time, prefer Blob), `proofs` (publish/revoke), `devices`, `cron/daily` (expire proofs, keep-alive), `health`. Schema `turnproof` on Neon.

## 4. Verification
Vitest on checklist/turnover/stamp/schedule (TDD); API tests incl. proof expiry and revoke; `expo-doctor`, exports; Android device pass (camera + stamps); Mac pass; proof page checked in the browser.
