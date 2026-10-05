// Applies the drizzle migrations in `drizzle/` (bundled by babel-plugin-inline-import).
// This is drizzle's `useMigrations` contract (`{ success, error }`) on top of the same `migrate()`
// call, but single-flight per JS runtime: the root layout and headless work (widget handler,
// background task, notification actions) can all await it without migrating twice.
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect, useSyncExternalStore } from 'react';

import migrations from '../../drizzle/migrations';
import { db } from './db';
import { createStore, markDatabaseReady } from './store';

export type DatabaseReadyState = { success: boolean; error?: Error };

const readyState = createStore<DatabaseReadyState>({ success: false });
let pending: Promise<void> | null = null;

/** Migrates once, then marks the change bus ready so live queries start returning data. */
export function ensureDatabaseReady(): Promise<void> {
  if (!pending) {
    pending = migrate(db, migrations)
      .then(() => {
        markDatabaseReady();
        readyState.setState({ success: true });
      })
      .catch((error: unknown) => {
        pending = null; // allow a retry
        const err = error instanceof Error ? error : new Error(String(error));
        readyState.setState({ success: false, error: err });
        throw err;
      });
  }
  return pending;
}

/**
 * Gate the UI on `success` before rendering screens that use data hooks (until then the hooks
 * return empty fallbacks). Same shape as drizzle's `useMigrations`.
 */
export function useDatabaseMigrations(): DatabaseReadyState {
  useEffect(() => {
    ensureDatabaseReady().catch(() => undefined);
  }, []);
  return useSyncExternalStore(readyState.subscribe, readyState.getSnapshot);
}
