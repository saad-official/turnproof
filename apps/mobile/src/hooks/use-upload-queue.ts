import { useStore } from '@/data/store';
import { kickUploadQueue, retryFailedUploads, type UploadQueueState, uploadQueueStore } from '@/data/upload-queue';

export type UploadQueueView = UploadQueueState & {
  /** Drain now (e.g. pull-to-refresh). */
  kick: () => void;
  /** Clear the backoff of failed uploads and drain now. */
  retry: () => void;
};

/**
 * Photo upload queue: `{ running, paused: 'offline' | 'signed-out' | null, current, counts:
 * { local, uploading, uploaded, failed }, pending, lastError, kick(), retry() }`.
 */
export function useUploadQueue(): UploadQueueView {
  const state = useStore(uploadQueueStore);
  return { ...state, kick: kickUploadQueue, retry: retryFailedUploads };
}
