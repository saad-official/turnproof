// Tiny external stores for useSyncExternalStore. Repositories bump a per-table version after every
// write; hooks re-run their synchronous drizzle query only when a table they read changed.
// No React context, no providers.
import { useSyncExternalStore } from 'react';

export type Listener = () => void;

export interface Store<T> {
  getSnapshot(): T;
  setState(next: T | ((prev: T) => T)): void;
  subscribe(listener: Listener): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    getSnapshot: () => state,
    setState(next) {
      const value = typeof next === 'function' ? (next as (prev: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Subscribe a component to a store. `selector` must return a stable value (primitive or cached object). */
export function useStore<T, S = T>(store: Store<T>, selector?: (state: T) => S): S {
  return useSyncExternalStore(store.subscribe, () =>
    selector ? selector(store.getSnapshot()) : (store.getSnapshot() as unknown as S),
  );
}

// ---------------------------------------------------------------------------
// Table change bus

export const TABLES = ['properties', 'turnovers', 'photos', 'issues', 'proofs', 'settings', 'sync_state'] as const;
export type TableName = (typeof TABLES)[number];

type Versions = Record<TableName, number> & { ready: number };

const initialVersions = Object.fromEntries([...TABLES, 'ready'].map((t) => [t, 0])) as Versions;

/** Per-table write counters (+ `ready`, set once the database is migrated). */
export const tableVersions = createStore<Versions>(initialVersions);

/** Called by repositories after a committed write. */
export function notifyTables(...tables: TableName[]): void {
  if (tables.length === 0) return;
  tableVersions.setState((prev) => {
    const next = { ...prev };
    for (const t of tables) next[t] += 1;
    return next;
  });
}

/** Listen for writes to specific tables (native surfaces, sync). Returns unsubscribe. */
export function onTablesChanged(tables: readonly TableName[], listener: Listener): () => void {
  let last = tables.map((t) => tableVersions.getSnapshot()[t]).join('.');
  return tableVersions.subscribe(() => {
    const sig = tables.map((t) => tableVersions.getSnapshot()[t]).join('.');
    if (sig !== last) {
      last = sig;
      listener();
    }
  });
}

export function markDatabaseReady(): void {
  tableVersions.setState((prev) => (prev.ready === 1 ? prev : { ...prev, ready: 1 }));
}

export function isDatabaseReady(): boolean {
  return tableVersions.getSnapshot().ready === 1;
}

// ---------------------------------------------------------------------------
// Live queries

const queryCache = new Map<string, { sig: string; value: unknown }>();

function signature(tables: readonly TableName[], variant: string): string {
  const v = tableVersions.getSnapshot();
  return `${tables.map((t) => v[t]).join('.')}|${variant}`;
}

/**
 * Runs `query` (a synchronous drizzle call) at most once per change of the listed tables and
 * returns a referentially stable result in between. `key` must identify the query including its
 * arguments; `variant` (e.g. the clock tick or today's key) forces a re-run without growing the cache.
 */
export function readLiveQuery<T>(key: string, tables: readonly TableName[], query: () => T, variant = ''): T {
  const sig = signature(tables, variant);
  const hit = queryCache.get(key);
  if (hit && hit.sig === sig) return hit.value as T;
  const value = query();
  queryCache.set(key, { sig, value });
  return value;
}

/**
 * React binding for `readLiveQuery`. Returns `fallback` until the database is migrated, so keep
 * `fallback` a module-level constant (stable identity).
 */
export function useLiveQuery<T>(
  key: string,
  tables: readonly TableName[],
  query: () => T,
  fallback: T,
  variant = '',
): T {
  return useSyncExternalStore(tableVersions.subscribe, () =>
    isDatabaseReady() ? readLiveQuery(key, tables, query, variant) : fallback,
  );
}
