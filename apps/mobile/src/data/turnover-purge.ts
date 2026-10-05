// The irreversible half of deleting a finished / abandoned turnover. `deleteTurnover` soft-deletes
// the rows at once (they sync) and keeps the photo files and any live proof link for an undo
// window; when it closes (or at the next maintenance run after the app was killed) the live link
// is revoked (signed in, best effort) and the local photo files are removed.
// No native-surface imports here: `native/surfaces.ts` calls `finalizeDeletedTurnovers` too.
import { and, eq, inArray, isNotNull, lte } from 'drizzle-orm';

import { deletePhotoFile } from '@/native/photo-files';

import { isSignedIn } from './auth-client';
import { db } from './db';
import { toPhoto } from './mappers';
import { clearLocalUri } from './photos-repo';
import { revokeProofLink } from './proofs-client';
import { currentProof } from './proofs-repo';
import { photos, turnovers } from './schema';
import { getTurnover } from './turnovers-repo';

/** How long a deleted turnover can be restored (`restoreTurnover`); longer than the undo toast. */
export const TURNOVER_UNDO_MS = 10_000;

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Opens the undo window for a just-deleted turnover; finalizes it when the window closes. */
export function openUndoWindow(turnoverId: string): void {
  cancelUndoWindow(turnoverId);
  pending.set(
    turnoverId,
    setTimeout(() => {
      pending.delete(turnoverId);
      finalizeTurnoverDeletion(turnoverId).catch((e) => console.warn('[turnover-purge] finalize failed', e));
    }, TURNOVER_UNDO_MS),
  );
}

/** Closes the window without finalizing. False when it had already closed (too late to undo). */
export function cancelUndoWindow(turnoverId: string): boolean {
  const timer = pending.get(turnoverId);
  if (!timer) return false;
  clearTimeout(timer);
  pending.delete(turnoverId);
  return true;
}

const stillDeleted = (id: string) => !!getTurnover(id)?.deletedAt;

/** Revokes a live proof link (signed in, best effort), then removes the deleted photos' files. */
export async function finalizeTurnoverDeletion(turnoverId: string): Promise<void> {
  if (pending.has(turnoverId) || !stillDeleted(turnoverId)) return;
  const live = currentProof(turnoverId);
  if (live && (await isSignedIn().catch(() => false))) {
    await revokeProofLink(live.id).catch((e) => console.warn('[turnover-purge] revoke failed', e));
  }
  // Restored while the request was in flight: keep the files.
  if (pending.has(turnoverId) || !stillDeleted(turnoverId)) return;
  const rows = db
    .select()
    .from(photos)
    .where(and(eq(photos.turnoverId, turnoverId), isNotNull(photos.deletedAt), isNotNull(photos.localUri)))
    .all()
    .map(toPhoto);
  for (const p of rows) {
    deletePhotoFile(p.localUri);
    clearLocalUri(p.id);
  }
}

/**
 * Maintenance sweep: finalizes every turnover deleted more than `TURNOVER_UNDO_MS` ago that still
 * has photo files or a live link on this phone (app killed inside the window, or deleted on
 * another device and pulled). Never throws.
 */
export async function finalizeDeletedTurnovers(now: number = Date.now()): Promise<void> {
  try {
    const cutoff = new Date(now - TURNOVER_UNDO_MS).toISOString();
    const deleted = db
      .select({ id: turnovers.id })
      .from(turnovers)
      .where(and(isNotNull(turnovers.deletedAt), lte(turnovers.deletedAt, cutoff)))
      .all()
      .map((r) => r.id);
    if (!deleted.length) return;
    const withFiles = new Set(
      db
        .select({ id: photos.turnoverId })
        .from(photos)
        .where(and(inArray(photos.turnoverId, deleted), isNotNull(photos.deletedAt), isNotNull(photos.localUri)))
        .all()
        .map((r) => r.id),
    );
    for (const id of deleted) {
      if (withFiles.has(id) || currentProof(id)) await finalizeTurnoverDeletion(id);
    }
  } catch (error) {
    console.warn('[turnover-purge] sweep failed', error);
  }
}

