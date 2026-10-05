import type { IsoString } from "./tz";

/** Any synced row: UUID id, `updatedAt`, optional soft-delete tombstone. */
export interface SyncRow {
  id: string;
  updatedAt: IsoString;
  deletedAt?: IsoString | null;
}

export interface PullResult<T extends SyncRow> {
  rows: T[];
  /** Ids where the remote row replaced (or added to) local data. */
  applied: string[];
  /** Ids where the local row was newer and still needs pushing. */
  kept: string[];
}

/** A row's effective version in ms: the later of `updatedAt` and `deletedAt`. */
export function rowVersion(row: SyncRow): number {
  const updated = Date.parse(row.updatedAt);
  return row.deletedAt ? Math.max(updated, Date.parse(row.deletedAt)) : updated;
}

/** Last-write-wins on `rowVersion` (so a newer delete beats an older edit); ties go to remote. */
export function pickWinner<T extends SyncRow>(local: T, remote: T): T {
  return rowVersion(local) > rowVersion(remote) ? local : remote;
}

/** Union of both sides by id, each id resolved by `pickWinner`. Local order first, then remote-only rows. */
export function mergeRows<T extends SyncRow>(local: readonly T[], remote: readonly T[]): T[] {
  return applyPull(local, remote).rows;
}

/** Rows changed (edited or soft-deleted) strictly after `since`; all rows when `since` is unset. */
export function diffDirty<T extends SyncRow>(rows: readonly T[], since: IsoString | null | undefined): T[] {
  if (!since) return [...rows];
  const floor = Date.parse(since);
  return rows.filter((r) => rowVersion(r) > floor);
}

function sameRow(a: SyncRow, b: SyncRow): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const av = (a as unknown as Record<string, unknown>)[k];
    const bv = (b as unknown as Record<string, unknown>)[k];
    if (av !== bv && JSON.stringify(av) !== JSON.stringify(bv)) return false;
  }
  return true;
}

/** Merge a pull into local rows and report which ids changed locally and which local rows won. */
export function applyPull<T extends SyncRow>(localRows: readonly T[], pulled: readonly T[]): PullResult<T> {
  const byId = new Map<string, T>();
  for (const r of localRows) byId.set(r.id, r);
  const applied: string[] = [];
  const kept: string[] = [];
  for (const remote of pulled) {
    const local = byId.get(remote.id);
    if (!local) {
      byId.set(remote.id, remote);
      applied.push(remote.id);
      continue;
    }
    const winner = pickWinner(local, remote);
    if (winner === local) kept.push(local.id);
    else if (!sameRow(local, remote)) {
      byId.set(remote.id, remote);
      applied.push(remote.id);
    }
  }
  return { rows: [...byId.values()], applied, kept };
}

// ---------------------------------------------------------------------------
// Device-side pull glue (the app writes `upserts` through its repositories)

/** The `since` for a pull: the oldest per-table cursor; undefined (full pull) when any table was never pulled. */
export function pullCursor(cursors: readonly (IsoString | null | undefined)[]): IsoString | undefined {
  if (cursors.length === 0 || cursors.some((c) => !c)) return undefined;
  return (cursors as IsoString[]).reduce((min, c) => (Date.parse(c) < Date.parse(min) ? c : min));
}

export interface RemoteApplyPlan<T extends SyncRow> {
  /** Remote rows to write locally (new or newer than the local copy). */
  upserts: T[];
  /** Ids where the local row is newer and still needs pushing. */
  kept: string[];
  /** Remote winners refused by `accept`. */
  skipped: string[];
}

/**
 * Rows of one table to write for a pull: `applyPull` winners that differ from the local copy
 * and pass `accept(remote, local)`. `local` only needs the rows whose ids were pulled.
 */
export function planRemoteApply<T extends SyncRow>(
  local: readonly T[],
  pulled: readonly T[],
  accept: (remote: T, local: T | undefined) => boolean = () => true,
): RemoteApplyPlan<T> {
  const localById = new Map(local.map((r) => [r.id, r]));
  const { rows, applied, kept } = applyPull(local, pulled);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const upserts: T[] = [];
  const skipped: string[] = [];
  for (const id of applied) {
    const remote = byId.get(id) as T;
    if (accept(remote, localById.get(id))) upserts.push(remote);
    else skipped.push(id);
  }
  return { upserts, kept, skipped };
}

/**
 * Photo rows from other devices point at a file on that phone. Until binary upload exists,
 * only accept updates/tombstones for photos this device already has, or photos with an
 * uploaded copy.
 */
export function acceptPulledPhoto(remote: { remoteUrl?: string | null }, local: unknown): boolean {
  return local !== undefined || !!remote.remoteUrl;
}

export interface RunningLikeRow extends SyncRow {
  startedAt: IsoString;
  endedAt?: IsoString | null;
}

const runs = (r: RunningLikeRow) => !r.endedAt && !r.deletedAt;

/**
 * Keep "at most one running entry" true while applying pulled entries. A remote running entry
 * is deferred while a different entry runs here (it arrives once the other phone stops it and
 * its `updatedAt` moves past the cursor); of several remote running entries only the latest
 * start is applied. Deferred ids are left untouched locally.
 */
export function deferConflictingRunning<T extends RunningLikeRow>(
  localRunningId: string | null,
  upserts: readonly T[],
): { apply: T[]; deferred: string[] } {
  const touched = new Map(upserts.map((r) => [r.id, r]));
  const localStillRuns = localRunningId != null && (!touched.has(localRunningId) || runs(touched.get(localRunningId)!));
  const incoming = upserts.filter((r) => runs(r) && r.id !== localRunningId);
  let allowed: string | null = null;
  if (!localStillRuns && incoming.length) {
    allowed = incoming.reduce((a, b) => (Date.parse(b.startedAt) > Date.parse(a.startedAt) ? b : a)).id;
  }
  const deferred = incoming.filter((r) => r.id !== allowed).map((r) => r.id);
  const skip = new Set(deferred);
  return { apply: upserts.filter((r) => !skip.has(r.id)), deferred };
}
