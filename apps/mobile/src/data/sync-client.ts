// Property sync: pushes rows dirtied since the last push and pulls rows changed on the server, using
// shared `diffDirty` / `planRemoteApply` (last write wins) against `/api/sync/push|pull`
// (wire: shared `SyncPushRequestSchema` / `SyncPullResponseSchema`). Runs whenever the user is
// signed in, so a cleaner's turnovers reach the host's phone and proofs can be published.
// Photo rows travel without `localUri` (a device path); the bytes go up via upload-queue.ts.
import {
  diffDirty,
  type Issue,
  IssueSchema,
  type Photo,
  PhotoSchema,
  planRemoteApply,
  acceptPulledPhoto,
  type Property,
  PropertySchema,
  rowVersion,
  type SyncPullResponse,
  type SyncRow,
  type Turnover,
  TurnoverSchema,
} from '@turnproof/shared';

import { refreshSurfaces } from '@/native/surfaces';

import { ApiError, apiFetch } from './api';
import { isSignedIn } from './auth-client';
import { allIssueRows, putIssues } from './issues-repo';
import { stripLocal } from './mappers';
import { allPhotoRows, getPhotos, mergePulledPhotos } from './photos-repo';
import { allPropertyRows, putProperties } from './properties-repo';
import { getAppValue, setAppValue } from './settings-repo';
import { createStore } from './store';
import { getDeviceId, getSyncState, pullCursor, setPulledAt, setPushedUpTo, SYNCED_TABLES, type SyncedTable } from './sync-state-repo';
import { allTurnoverRows, getTurnover, putTurnovers } from './turnovers-repo';

const MAX_PUSH_ROWS = 500;

// ---------------------------------------------------------------------------
// Status store (for UI)

export type SyncStatus = { running: boolean; lastSyncAt: string | null; error: string | null };
export const syncStatus = createStore<SyncStatus>({ running: false, lastSyncAt: null, error: null });
let statusHydrated = false;

/** Loads the last sync time / error persisted in settings (after migrations). */
export function hydrateSyncStatus(): void {
  if (statusHydrated) return;
  statusHydrated = true;
  syncStatus.setState({
    running: false,
    lastSyncAt: getAppValue<string | null>('lastSyncAt', null),
    error: getAppValue<string | null>('lastSyncError', null),
  });
}

// ---------------------------------------------------------------------------
// Push

const maxVersion = (rows: readonly SyncRow[]) => rows.reduce((max, r) => Math.max(max, rowVersion(r)), 0);

/** Photos as the server sees them: no device path. */
const wirePhoto = (p: Photo): Photo => ({ ...stripLocal(p), localUri: null });

type DirtyTables = { properties: Property[]; turnovers: Turnover[]; photos: Photo[]; issues: Issue[] };

function collectDirty(): DirtyTables {
  return {
    properties: diffDirty(allPropertyRows(), getSyncState('properties').pushedUpTo),
    turnovers: diffDirty(allTurnoverRows(), getSyncState('turnovers').pushedUpTo),
    photos: diffDirty(allPhotoRows(), getSyncState('photos').pushedUpTo).map(wirePhoto),
    issues: diffDirty(allIssueRows(), getSyncState('issues').pushedUpTo),
  };
}

/** Rows still waiting for a push (for the sync badge). */
export function pendingPushCount(): number {
  const d = collectDirty();
  return d.properties.length + d.turnovers.length + d.photos.length + d.issues.length;
}

/**
 * POST /api/sync/push with every row changed since that table's last accepted push. Throws on
 * failure (nothing is marked pushed, so the next call re-sends: the server is idempotent).
 */
export async function pushDirty(): Promise<{ pushed: number; accepted: number }> {
  const dirty = collectDirty();
  const total = dirty.properties.length + dirty.turnovers.length + dirty.photos.length + dirty.issues.length;
  if (!total) return { pushed: 0, accepted: 0 };
  const deviceId = getDeviceId();
  let accepted = 0;
  const longest = Math.max(dirty.properties.length, dirty.turnovers.length, dirty.photos.length, dirty.issues.length);
  const pages = Math.max(1, Math.ceil(longest / MAX_PUSH_ROWS));
  for (let i = 0; i < pages; i++) {
    const slice = <T>(xs: T[]) => xs.slice(i * MAX_PUSH_ROWS, (i + 1) * MAX_PUSH_ROWS);
    const res = await apiFetch<{ serverTime: string; accepted: number }>('/api/sync/push', {
      method: 'POST',
      body: {
        deviceId,
        tables: {
          // Parents first in every page so the server can check ownership of children.
          properties: slice(dirty.properties),
          turnovers: slice(dirty.turnovers),
          photos: slice(dirty.photos),
          issues: slice(dirty.issues),
        },
      },
    });
    accepted += res.accepted;
  }
  const mark = (table: SyncedTable, rows: readonly SyncRow[]) => {
    if (rows.length) setPushedUpTo(table, new Date(maxVersion(rows)).toISOString());
  };
  mark('properties', dirty.properties);
  mark('turnovers', dirty.turnovers);
  mark('photos', dirty.photos);
  mark('issues', dirty.issues);
  return { pushed: total, accepted };
}

// ---------------------------------------------------------------------------
// Pull

function validRows<T>(rows: unknown, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }): T[] {
  if (!Array.isArray(rows)) return [];
  const out: T[] = [];
  for (const r of rows) {
    const parsed = schema.safeParse(r);
    if (parsed.success) out.push(parsed.data);
    else console.warn('[sync] dropped an invalid pulled row');
  }
  return out;
}

/** GET /api/sync/pull?since=<cursor>, merged last-write-wins into local tables. */
export async function pullSince(): Promise<{ applied: number }> {
  const since = pullCursor();
  const res = await apiFetch<{ serverTime: string; tables?: Partial<Record<keyof SyncPullResponse['tables'], unknown>> }>(
    '/api/sync/pull',
    { query: { since: since ?? undefined } },
  );
  const tables = res.tables ?? {};
  const pulled = {
    properties: validRows<Property>(tables.properties, PropertySchema),
    turnovers: validRows<Turnover>(tables.turnovers, TurnoverSchema),
    photos: validRows<Photo>(tables.photos, PhotoSchema),
    issues: validRows<Issue>(tables.issues, IssueSchema),
  };
  let applied = 0;

  const props = planRemoteApply(allPropertyRows(), pulled.properties);
  putProperties(props.upserts);
  applied += props.upserts.length;

  const localTurnovers = pulled.turnovers.map((t) => getTurnover(t.id)).filter((t): t is Turnover => !!t);
  const turns = planRemoteApply(localTurnovers, pulled.turnovers);
  putTurnovers(turns.upserts);
  applied += turns.upserts.length;

  const localPhotos = getPhotos(pulled.photos.map((p) => p.id)).map(stripLocal);
  const pics = planRemoteApply(localPhotos, pulled.photos, acceptPulledPhoto);
  mergePulledPhotos(pics.upserts);
  applied += pics.upserts.length;

  const iss = planRemoteApply(allIssueRows(), pulled.issues);
  putIssues(iss.upserts);
  applied += iss.upserts.length;

  setPulledAt(SYNCED_TABLES, res.serverTime);
  return { applied };
}

// ---------------------------------------------------------------------------
// Orchestration

let running: Promise<void> | null = null;

/** Push then pull when signed in. Single-flight; never throws (errors land in `syncStatus`). */
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      if (!(await isSignedIn())) return;
      syncStatus.setState((s) => ({ ...s, running: true, error: null }));
      await pushDirty();
      const { applied } = await pullSince();
      const at = new Date().toISOString();
      setAppValue('lastSyncAt', at);
      setAppValue('lastSyncError', undefined);
      syncStatus.setState({ running: false, lastSyncAt: at, error: null });
      // Pulled schedule changes: bring reminders, widgets and the Live Activity in line.
      if (applied) await refreshSurfaces();
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 401
          ? 'Signed out'
          : error instanceof Error
            ? error.message
            : String(error);
      setAppValue('lastSyncError', message);
      syncStatus.setState((s) => ({ ...s, running: false, error: message }));
    } finally {
      running = null;
    }
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced `syncNow` after local writes (actions call this). */
export function scheduleSync(delayMs = 4000): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delayMs);
}
