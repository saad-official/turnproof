// Sync bookkeeping: one `sync_state` row per synced table (push high-water mark + pull cursor),
// plus the per-install device id (an app-local setting, so it survives cursor resets).
import { eq } from 'drizzle-orm';

import { db } from './db';
import { newId } from './mappers';
import { syncState } from './schema';
import { getAppValue, setAppValue } from './settings-repo';
import { notifyTables } from './store';
import { nowIso } from './time';

export const SYNCED_TABLES = ['properties', 'turnovers', 'photos', 'issues'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export type SyncState = {
  tableName: SyncedTable;
  /** Highest row version (ISO) the server accepted; rows newer than this are pushed next. */
  pushedUpTo: string | null;
  /** Server `serverTime` from the last pull; sent as `?since=`. */
  pulledAt: string | null;
};

export function getSyncState(table: SyncedTable): SyncState {
  const row = db.select().from(syncState).where(eq(syncState.tableName, table)).get();
  return { tableName: table, pushedUpTo: row?.pushedUpTo ?? null, pulledAt: row?.pulledAt ?? null };
}

function upsert(table: SyncedTable, patch: Partial<Pick<SyncState, 'pushedUpTo' | 'pulledAt'>>): void {
  const current = getSyncState(table);
  const row = {
    tableName: table,
    pushedUpTo: patch.pushedUpTo !== undefined ? patch.pushedUpTo : current.pushedUpTo,
    pulledAt: patch.pulledAt !== undefined ? patch.pulledAt : current.pulledAt,
    updatedAt: nowIso(),
  };
  db.insert(syncState).values(row).onConflictDoUpdate({ target: syncState.tableName, set: row }).run();
}

export function setPushedUpTo(table: SyncedTable, iso: string): void {
  upsert(table, { pushedUpTo: iso });
  notifyTables('sync_state');
}

/** Stores the pull cursor for every table pulled in one request. */
export function setPulledAt(tables: readonly SyncedTable[], iso: string): void {
  db.transaction(() => {
    for (const t of tables) upsert(t, { pulledAt: iso });
  });
  notifyTables('sync_state');
}

/**
 * The `?since=` cursor for a pull covering `tables`: the oldest per-table cursor, or null (pull
 * everything) when any table has never been pulled.
 */
export function pullCursor(tables: readonly SyncedTable[] = SYNCED_TABLES): string | null {
  const cursors = tables.map((t) => getSyncState(t).pulledAt);
  if (cursors.some((c) => !c)) return null;
  return (cursors as string[]).sort()[0] ?? null;
}

/** Forget cursors (sign-out / leaving a property) so the next sync pushes and pulls everything. */
export function resetSyncCursors(): void {
  db.delete(syncState).run();
  notifyTables('sync_state');
}

/** Stable id of this install (sent with sync pushes). */
export function getDeviceId(): string {
  const existing = getAppValue<string | null>('deviceId', null);
  if (existing) return existing;
  const id = newId();
  setAppValue('deviceId', id);
  return id;
}
