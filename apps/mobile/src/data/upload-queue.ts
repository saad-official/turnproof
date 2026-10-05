// Photo upload queue: sequential, resumable, persisted in `photos.upload_state`
// ('local' → 'uploading' → 'uploaded' | 'failed'). Each photo's final JPEG goes up as raw bytes:
//   POST /api/photos/:id/upload   content-type: image/jpeg   x-content-sha256: <stamp.sha256>
//   → 200 { remoteUrl }   (404 photo_not_found: the row is not synced yet → push, retry once;
//                          409 hash_mismatch / 413: permanent failure for this file)
// The photo row (stamp, phase, room) reaches the server through sync; the server checks the bytes
// against the stamp's sha256 before it shows the "verified capture" badge.
//
// Pauses while offline (resumes on reconnect) and while signed out (resumes after sign-in).
// Failures back off exponentially (15 s … 1 h). A row left 'uploading' by a killed app is reset to
// 'local' at start. Uploads are idempotent server-side, so a resumed photo simply goes up again.
import { addConnectivityListener, isOnline } from '@/native/network';
import { fileExists, readFileBytes } from '@/native/photo-files';

import { ApiError, authedFetch, readJson } from './api';
import { isSignedIn } from './auth-client';
import {
  clearFailedBackoff,
  clearLocalUri as forgetMissingFile,
  getPhoto,
  nextRetryAt,
  nextUploadCandidate,
  resetInterruptedUploads,
  setUploadState,
  uploadCounts,
  type UploadCounts,
} from './photos-repo';
import { createStore, isDatabaseReady, onTablesChanged } from './store';
import { pushDirty, scheduleSync } from './sync-client';
import { nowIso } from './time';

export type UploadPauseReason = 'offline' | 'signed-out';

export type UploadQueueState = {
  /** A drain loop is running. */
  running: boolean;
  paused: UploadPauseReason | null;
  /** Photo id being uploaded right now. */
  current: string | null;
  counts: UploadCounts;
  /** Photos still to go up (local + uploading + failed). */
  pending: number;
  lastError: string | null;
};

const EMPTY_COUNTS: UploadCounts = { local: 0, uploading: 0, uploaded: 0, failed: 0 };

export const uploadQueueStore = createStore<UploadQueueState>({
  running: false,
  paused: null,
  current: null,
  counts: EMPTY_COUNTS,
  pending: 0,
  lastError: null,
});

function refreshCounts(): void {
  if (!isDatabaseReady()) return;
  const counts = uploadCounts();
  uploadQueueStore.setState((s) => {
    const same = (Object.keys(counts) as (keyof UploadCounts)[]).every((k) => s.counts[k] === counts[k]);
    return same ? s : { ...s, counts, pending: counts.local + counts.uploading + counts.failed };
  });
}

const BACKOFF_BASE_MS = 15_000;
const BACKOFF_MAX_MS = 3_600_000;
const UPLOAD_TIMEOUT_MS = 120_000;

function backoffMs(attempts: number): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(exp * (0.8 + Math.random() * 0.4));
}

type UploadOutcome = 'uploaded' | 'retry' | 'permanent' | 'paused-offline' | 'paused-signed-out' | 'skipped';

/** Uploads one photo. Never throws. */
async function uploadOne(photoId: string, opts: { allowPushRetry: boolean; signal?: AbortSignal }): Promise<UploadOutcome> {
  const photo = getPhoto(photoId);
  if (!photo || photo.deletedAt || photo.uploadState === 'uploaded') return 'skipped';
  if (!photo.localUri || !fileExists(photo.localUri)) {
    // The file is gone (e.g. app data restored without files): nothing to upload, ever.
    if (photo.localUri) forgetMissingFile(photo.id);
    return 'skipped';
  }
  setUploadState(photo.id, { uploadState: 'uploading', attempt: true });
  uploadQueueStore.setState((s) => ({ ...s, current: photo.id }));
  try {
    const bytes = await readFileBytes(photo.localUri);
    const res = await authedFetch(`/api/photos/${encodeURIComponent(photo.id)}/upload`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', 'x-content-sha256': photo.stamp.sha256 },
      body: bytes,
      timeoutMs: UPLOAD_TIMEOUT_MS,
      signal: opts.signal,
    });
    if (res.status === 404 && opts.allowPushRetry) {
      // The row is not on the server yet: push it, then try once more.
      await pushDirty();
      return uploadOne(photoId, { ...opts, allowPushRetry: false });
    }
    const body = await readJson<{ remoteUrl?: string; url?: string }>(res);
    const remoteUrl = body?.remoteUrl ?? body?.url;
    setUploadState(photo.id, {
      uploadState: 'uploaded',
      uploadError: null,
      nextAttemptAt: null,
      ...(remoteUrl ? { remoteUrl } : {}),
    });
    return 'uploaded';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ApiError && error.status === 401) {
      setUploadState(photo.id, { uploadState: 'local', uploadError: null });
      return 'paused-signed-out';
    }
    if (error instanceof ApiError && error.code === 'aborted') {
      setUploadState(photo.id, { uploadState: 'local' });
      return 'skipped';
    }
    if (error instanceof ApiError && error.status === 0 && !(await isOnline())) {
      setUploadState(photo.id, { uploadState: 'local', uploadError: null });
      return 'paused-offline';
    }
    const permanent = error instanceof ApiError && (error.status === 409 || error.status === 413 || error.status === 422);
    const attempts = (getPhoto(photo.id)?.uploadAttempts ?? 1) || 1;
    setUploadState(photo.id, {
      uploadState: 'failed',
      uploadError: message,
      // A permanent failure waits a day (the user can still force a retry from the UI).
      nextAttemptAt: new Date(Date.now() + (permanent ? 86_400_000 : backoffMs(attempts))).toISOString(),
    });
    uploadQueueStore.setState((s) => ({ ...s, lastError: message }));
    return permanent ? 'permanent' : 'retry';
  } finally {
    uploadQueueStore.setState((s) => ({ ...s, current: null }));
  }
}

// ---------------------------------------------------------------------------
// Drain loop (one at a time; `uploadTurnoverPhotos` waits for it)

let lock: Promise<unknown> = Promise.resolve();
let draining = false;
let again = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = lock.then(job, job);
  lock = run.catch(() => undefined);
  return run;
}

async function preconditions(): Promise<UploadPauseReason | null> {
  if (!(await isSignedIn())) return 'signed-out';
  if (!(await isOnline())) return 'offline';
  return null;
}

function scheduleRetryTimer(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const at = nextRetryAt();
  if (!at) return;
  const wait = Math.max(1000, Math.min(Date.parse(at) - Date.now() + 250, BACKOFF_MAX_MS));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    kickUploadQueue();
  }, wait);
}

async function drain(): Promise<void> {
  const paused = await preconditions();
  uploadQueueStore.setState((s) => ({ ...s, paused }));
  if (paused) return;
  uploadQueueStore.setState((s) => ({ ...s, running: true }));
  const tried = new Set<string>();
  let uploaded = 0;
  try {
    for (;;) {
      const next = nextUploadCandidate(nowIso(), { excludeIds: [...tried] });
      if (!next) break;
      tried.add(next.id);
      const outcome = await uploadOne(next.id, { allowPushRetry: true });
      refreshCounts();
      if (outcome === 'uploaded') uploaded++;
      if (outcome === 'paused-offline' || outcome === 'paused-signed-out') {
        uploadQueueStore.setState((s) => ({ ...s, paused: outcome === 'paused-offline' ? 'offline' : 'signed-out' }));
        break;
      }
    }
  } finally {
    uploadQueueStore.setState((s) => ({ ...s, running: false }));
    if (uploaded) scheduleSync(1000); // remoteUrls changed
    scheduleRetryTimer();
  }
}

/** Starts (or re-runs after the current pass) the background drain. Fire and forget; never throws. */
export function kickUploadQueue(): void {
  if (!isDatabaseReady()) return;
  if (draining) {
    again = true;
    return;
  }
  draining = true;
  void exclusive(async () => {
    try {
      do {
        again = false;
        await drain();
      } while (again);
    } catch (error) {
      console.warn('[upload-queue] drain failed', error);
    } finally {
      draining = false;
      refreshCounts();
    }
  });
}

export type TurnoverUploadResult =
  | { ok: true; uploaded: number }
  | { ok: false; reason: UploadPauseReason | 'failed'; failed: number; message?: string };

/**
 * Uploads every not-yet-uploaded photo of one turnover now, ignoring backoff (user action:
 * "Publish proof"). Waits for a running drain first. `onProgress(done, total)` after each photo.
 */
export function uploadTurnoverPhotos(
  turnoverId: string,
  opts: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<TurnoverUploadResult> {
  return exclusive(async (): Promise<TurnoverUploadResult> => {
    const paused = await preconditions();
    if (paused) {
      uploadQueueStore.setState((s) => ({ ...s, paused }));
      return { ok: false, reason: paused, failed: 0 };
    }
    uploadQueueStore.setState((s) => ({ ...s, paused: null, running: true }));
    const farFuture = '9999-12-31T00:00:00.000Z';
    const counts = uploadCounts(turnoverId);
    const total = counts.local + counts.uploading + counts.failed;
    const tried = new Set<string>();
    let done = 0;
    let failed = 0;
    let lastMessage: string | undefined;
    try {
      opts.onProgress?.(0, total);
      for (;;) {
        if (opts.signal?.aborted) break;
        const next = nextUploadCandidate(farFuture, { turnoverIds: [turnoverId], excludeIds: [...tried] });
        if (!next) break;
        tried.add(next.id);
        const outcome = await uploadOne(next.id, { allowPushRetry: true, signal: opts.signal });
        refreshCounts();
        if (outcome === 'paused-offline' || outcome === 'paused-signed-out') {
          const reason = outcome === 'paused-offline' ? 'offline' : 'signed-out';
          uploadQueueStore.setState((s) => ({ ...s, paused: reason }));
          return { ok: false, reason, failed: total - done };
        }
        if (outcome === 'retry' || outcome === 'permanent') {
          failed++;
          lastMessage = getPhoto(next.id)?.uploadError ?? undefined;
        } else done++;
        opts.onProgress?.(done, total);
      }
    } finally {
      uploadQueueStore.setState((s) => ({ ...s, running: false }));
      scheduleRetryTimer();
    }
    if (done) scheduleSync(500);
    return failed ? { ok: false, reason: 'failed', failed, message: lastMessage } : { ok: true, uploaded: done };
  });
}

/** Clears the backoff of failed uploads and drains now ("Retry" in the UI). */
export function retryFailedUploads(): void {
  if (!isDatabaseReady()) return;
  clearFailedBackoff();
  kickUploadQueue();
}

let started = false;

/**
 * Idempotent start (from `startNativeServices`): resets interrupted uploads, counts, and drains on
 * reconnect, on new photos and now. Returns a stop function.
 */
export function startUploadQueue(): () => void {
  if (started) return () => undefined;
  started = true;
  resetInterruptedUploads();
  refreshCounts();
  const offNet = addConnectivityListener((online) => {
    if (online) kickUploadQueue();
    else uploadQueueStore.setState((s) => ({ ...s, paused: 'offline' }));
  });
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const offPhotos = onTablesChanged(['photos'], () => {
    refreshCounts();
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      if (uploadQueueStore.getSnapshot().counts.local > 0) kickUploadQueue();
    }, 1500);
  });
  kickUploadQueue();
  return () => {
    started = false;
    offNet();
    offPhotos();
    if (debounce) clearTimeout(debounce);
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };
}
