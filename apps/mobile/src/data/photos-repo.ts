// Photos: stamp JSON, the local file and device-only upload bookkeeping (`upload_state`).
import type { Photo } from '@turnproof/shared';
import { and, asc, eq, inArray, isNotNull, isNull, lte, notInArray, or, sql } from 'drizzle-orm';

import { db } from './db';
import { fromPhoto, type LocalPhoto, toPhoto } from './mappers';
import { photos, type UploadState } from './schema';
import { notifyTables } from './store';

export function getPhoto(id: string): LocalPhoto | null {
  const row = db.select().from(photos).where(eq(photos.id, id)).get();
  return row ? toPhoto(row) : null;
}

export function getPhotos(ids: readonly string[]): LocalPhoto[] {
  if (!ids.length) return [];
  return db.select().from(photos).where(inArray(photos.id, [...ids])).all().map(toPhoto);
}

/**
 * Live photos of a turnover, by capture time. `roomId` undefined = all photos, `null` = photos
 * without a room (turnover-level issue / reference photos), a string = that room only.
 */
export function listPhotos(turnoverId: string, roomId?: string | null): LocalPhoto[] {
  const roomFilter = roomId === undefined ? undefined : roomId === null ? isNull(photos.roomId) : eq(photos.roomId, roomId);
  return db
    .select()
    .from(photos)
    .where(and(eq(photos.turnoverId, turnoverId), isNull(photos.deletedAt), roomFilter))
    .orderBy(asc(photos.createdAt))
    .all()
    .map(toPhoto);
}

/** Every row including soft-deleted ones (sync). */
export function allPhotoRows(): LocalPhoto[] {
  return db.select().from(photos).all().map(toPhoto);
}

/** Every row of a turnover including soft-deleted ones (file cleanup). */
export function allPhotosOfTurnover(turnoverId: string): LocalPhoto[] {
  return db.select().from(photos).where(eq(photos.turnoverId, turnoverId)).all().map(toPhoto);
}

export function putPhotos(list: readonly (Photo | LocalPhoto)[]): void {
  if (!list.length) return;
  db.transaction((tx) => {
    for (const p of list) {
      const row = fromPhoto(p);
      tx.insert(photos).values(row).onConflictDoUpdate({ target: photos.id, set: row }).run();
    }
  });
  notifyTables('photos');
}

export function savePhoto(p: LocalPhoto): LocalPhoto {
  putPhotos([p]);
  return p;
}

/**
 * Stores photos pulled from the server (the caller already resolved last-write-wins): shared fields
 * come from the server row, while this device's file and upload state are kept (a pulled row never
 * carries a usable local path).
 */
export function mergePulledPhotos(list: readonly Photo[]): void {
  if (!list.length) return;
  const local = new Map(getPhotos(list.map((p) => p.id)).map((p) => [p.id, p]));
  putPhotos(
    list.map((p): LocalPhoto => {
      const mine = local.get(p.id);
      const remoteUrl = p.remoteUrl ?? mine?.remoteUrl ?? null;
      return {
        ...p,
        localUri: mine?.localUri ?? null,
        remoteUrl,
        uploadState: remoteUrl ? 'uploaded' : (mine?.uploadState ?? 'local'),
        uploadAttempts: mine?.uploadAttempts ?? 0,
        uploadError: mine?.uploadError ?? null,
        nextAttemptAt: mine?.nextAttemptAt ?? null,
      };
    }),
  );
}

/** Upload bookkeeping only. `remoteUrl` is shared data, so setting it also bumps `updatedAt` (it syncs). */
export function setUploadState(
  id: string,
  patch: {
    uploadState: UploadState;
    uploadError?: string | null;
    nextAttemptAt?: string | null;
    remoteUrl?: string;
    attempt?: boolean;
  },
): void {
  db.update(photos)
    .set({
      uploadState: patch.uploadState,
      ...(patch.uploadError !== undefined ? { uploadError: patch.uploadError } : {}),
      ...(patch.nextAttemptAt !== undefined ? { nextAttemptAt: patch.nextAttemptAt } : {}),
      ...(patch.remoteUrl !== undefined ? { remoteUrl: patch.remoteUrl, updatedAt: new Date().toISOString() } : {}),
      ...(patch.attempt ? { uploadAttempts: sql`${photos.uploadAttempts} + 1` } : {}),
    })
    .where(eq(photos.id, id))
    .run();
  notifyTables('photos');
}

/**
 * The next photo to upload: live, has a local file, not uploaded and (when failed) past its backoff.
 * Oldest first, so a turnover's photos go up in capture order.
 */
export function nextUploadCandidate(
  now: string,
  opts: { turnoverIds?: readonly string[]; excludeIds?: readonly string[] } = {},
): LocalPhoto | null {
  const where = and(
    isNull(photos.deletedAt),
    isNotNull(photos.localUri),
    or(
      eq(photos.uploadState, 'local'),
      eq(photos.uploadState, 'uploading'),
      and(eq(photos.uploadState, 'failed'), or(isNull(photos.nextAttemptAt), lte(photos.nextAttemptAt, now))),
    ),
    opts.turnoverIds ? inArray(photos.turnoverId, [...opts.turnoverIds]) : undefined,
    opts.excludeIds?.length ? notInArray(photos.id, [...opts.excludeIds]) : undefined,
  );
  const row = db.select().from(photos).where(where).orderBy(asc(photos.createdAt)).get();
  return row ? toPhoto(row) : null;
}

/** Earliest pending retry instant among failed uploads, or null. */
export function nextRetryAt(): string | null {
  const row = db
    .select({ at: sql<string | null>`min(${photos.nextAttemptAt})` })
    .from(photos)
    .where(and(isNull(photos.deletedAt), isNotNull(photos.localUri), eq(photos.uploadState, 'failed')))
    .get();
  return row?.at ?? null;
}

export type UploadCounts = Record<UploadState, number>;

/** Live photos with a local file per upload state (optionally one turnover's). */
export function uploadCounts(turnoverId?: string): UploadCounts {
  const rows = db
    .select({ state: photos.uploadState, n: sql<number>`count(*)` })
    .from(photos)
    .where(and(isNull(photos.deletedAt), isNotNull(photos.localUri), turnoverId ? eq(photos.turnoverId, turnoverId) : undefined))
    .groupBy(photos.uploadState)
    .all();
  const out: UploadCounts = { local: 0, uploading: 0, uploaded: 0, failed: 0 };
  for (const r of rows) out[r.state] = Number(r.n);
  return out;
}

/** Turns stale `uploading` rows (app killed mid-upload) back into `local` so the queue resumes them. */
export function resetInterruptedUploads(): void {
  db.update(photos).set({ uploadState: 'local' }).where(eq(photos.uploadState, 'uploading')).run();
  notifyTables('photos');
}

/** Clears a soft-deleted or replaced photo's local path after its file was removed. */
export function clearLocalUri(id: string): void {
  db.update(photos).set({ localUri: null }).where(eq(photos.id, id)).run();
  notifyTables('photos');
}

/** Makes every failed upload eligible again now (user tapped "Retry"). */
export function clearFailedBackoff(): void {
  db.update(photos).set({ nextAttemptAt: null }).where(eq(photos.uploadState, 'failed')).run();
  notifyTables('photos');
}
