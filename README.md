# Turnproof

Proof that the turnover happened. Free.

Turnproof is a turnover app for solo cleaners and small short-term-rental hosts (1 to 5 units): a room-by-room checklist, before and after photos taken with the in-app camera and stamped with time, phone model, optional rough location and a SHA-256 fingerprint, a Live Activity for the turnover in progress, and a private proof link the host opens in any browser. Gallery imports are allowed only as clearly labelled "reference" photos. No subscription, no purchases, no ads.

**Why it exists.**
- "It wasn't clean" and damage disputes are settled with dated before/after photos per room, and platforms are stricter about evidence: Airbnb's 2026 damage policy (section 3.3.3) lets it deny evidence that is AI-generated or cannot be verified, and AirCover claims must be filed within 14 days of checkout.
- The existing tools are built for hosts and property managers who schedule cleaners (Turno from $10 per feature per month, TurnFlow from $79 a month, Breezeway, Properly). The cleaner doing the work has a paper checklist and a camera roll.

Landing site: [getturnproof.vercel.app](https://getturnproof.vercel.app) · example proof page: [`/example`](https://getturnproof.vercel.app/example) · spec: [`docs/spec.md`](docs/spec.md) · app data layer and API contract: [`docs/mobile-data-api.md`](docs/mobile-data-api.md).

## Monorepo layout

```
apps/mobile       Expo SDK 57 app: turnover flow (camera-first), stamps, Live Activity / Live Update, widgets, SQLite, sync
apps/web          Next.js 16: marketing site, public proof pages (/p/<slug>), API (Better Auth + Expo plugin, sync,
                  sharing by invite code, photo upload, proof links, devices, daily cron)
packages/shared   Pure TypeScript: checklist, turnover state machine, stamps + verification, schedule, reports,
                  zod schemas, sync merge, design tokens ("fresh linen")
docs/             Spec, mobile data layer and API contract, Mac testing guide
```

pnpm 12 workspace with a hoisted `node_modules` (Metro needs it; settings in `pnpm-workspace.yaml`). Node 24 (`.nvmrc`).

## Run it

```bash
pnpm install          # from the repo root
pnpm web              # landing site + API on http://localhost:3900
```

The web app needs no setup locally: without `DATABASE_URL` it runs an embedded Postgres (PGlite) in `apps/web/.pglite/`, migrated on first use, with a public development auth secret, and stores uploaded photos in Postgres. Copy `apps/web/.env.example` to `apps/web/.env.local` for Neon, Vercel Blob or real secrets; `bash apps/web/scripts/setup-env.sh` (Git Bash) pushes production secrets to Vercel and runs migrations.

```bash
cd apps/mobile
npx expo run:android --device   # development build on an Android phone over USB
npx expo start                  # Metro for an installed dev build
```

Install Expo libraries with `npx expo install <pkg>` inside `apps/mobile`, never `pnpm add`. To reach the local API from a phone over USB: `adb reverse tcp:3900 tcp:3900`. iPhone (Live Activities, widgets): [`docs/testing-on-mac.md`](docs/testing-on-mac.md).

## How the proof link works

1. The phone syncs the turnover's rows (`POST /api/sync/push`), then uploads each photo's JPEG (`POST /api/photos/:id/upload`). The server hashes the bytes it received and refuses them (409 `hash_mismatch`) unless they equal the sha256 the phone recorded at the shutter.
2. `POST /api/proofs` needs a finished turnover with every photo uploaded and creates `/p/<slug>` (10 random characters), expiring after 60 days by default.
3. The page shows the property name (never the address, access notes, invite code or anyone's account), the date and duration, each room's before and after photos with their stamps, the checklist and issues. A photo gets "Verified capture" only when it is a camera capture, its time falls within the turnover (10 minutes either side) and the uploaded bytes match its fingerprint; imports show "Reference photo".
4. Any member of the property can revoke a link. Expired and revoked links answer 410; photos are served through an access-checked route, so they stop loading too. Pages and photos are `noindex`. The daily cron deletes uploaded copies a week after a link ends (or a week after upload if never published) and 30 days after a turnover is deleted.

## API (apps/web)

Session: Better Auth cookie `turnproof.session_token` (the Expo client sends it; trusted origin `turnproof://`). JSON bodies are zod-validated.

| Route | Purpose |
| --- | --- |
| `/api/auth/*` | Better Auth (email + password, Expo plugin, account deletion) |
| `POST /api/sync/push`, `GET /api/sync/pull?since=` | Properties, turnovers, issues, photos (shared schemas), member-scoped, last-write-wins, tombstones |
| `GET /api/properties`, `POST /api/properties` | My properties with members / create and share in one call |
| `POST /api/properties/:id/share`, `POST /api/properties/:id/invite` | Owner: get the invite code / rotate it |
| `POST /api/properties/join` | Join by code (404 `invite_not_found`, 409 `already_member`) |
| `DELETE /api/properties/:id/members/:userId`, `DELETE /api/properties/:id` | Remove someone or leave (`me`) / owner deletes for everyone |
| `POST /api/photos/:id/upload`, `GET /api/photos/:id/file` | Upload (raw JPEG/WEBP or multipart, 2 MB, hash-checked) / access-checked bytes |
| `POST /api/proofs`, `GET /api/proofs?turnoverId=`, `DELETE /api/proofs/:id` | Publish / list / revoke proof links |
| `GET /api/public/proofs/:slug` | Link state for the proof-page proxy (200 / 410 / 404) |
| `POST /api/devices`, `DELETE /api/devices/:token` | Expo push tokens |
| `GET /api/cron/daily` | Bearer `CRON_SECRET`: keep-alive, expiry count, upload sweep |
| `GET /api/health` | Liveness |

Storage: Vercel Blob (private by default) when `BLOB_READ_WRITE_TOKEN` is set, otherwise the `photo_blobs` bytea table; both behind `apps/web/lib/storage.ts`. Database: Postgres schema `turnproof` (Neon in production), migrations in `apps/web/drizzle/`.

## Checks

```bash
pnpm lint
pnpm --filter web exec next typegen   # route types for the web typecheck
pnpm typecheck
pnpm test                             # Vitest: shared domain; web tokens, proxy and API against in-memory PGlite
pnpm build:web
```

CI (`.github/workflows/ci.yml`) runs the same on every push to `main` and every pull request. Web tests: [`apps/web/tests`](apps/web/tests) (properties, sync scoping, uploads, proofs, cron, auth, devices, the app's wire contract); domain tests live next to the code in [`packages/shared/src`](packages/shared/src).

## Status (v0.1)

| Area | State |
| --- | --- |
| Shared domain (`packages/shared`): checklist, turnover, stamps, schedule, reports, schemas, sync | Done, tested |
| Design tokens "fresh linen" (`packages/shared/src/tokens.ts`) | Done; WCAG AA contrast checked in both schemes |
| Web API: auth, sync, sharing, uploads, proof links, devices, cron | Done, tested on PGlite |
| Public proof page `/p/<slug>` (noindex, 410 when expired or revoked, lightbox) | Done |
| Marketing site: home, example proof page, privacy, terms, support | Done |
| Mobile app (Expo): turnover flow, camera stamps, Live Activity, widgets, sync, uploads | Built; device passes pending |
| Production deploy (Vercel + Neon + Blob) | Not started: run `apps/web/scripts/setup-env.sh` once the database exists |
| App Store / Google Play | Not started |
