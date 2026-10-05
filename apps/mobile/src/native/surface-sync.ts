// One call from the root layout starts everything native: `startNativeServices()`.
// Headless entry points (background task, Android widget handler, notification / Live Activity
// actions) are registered separately at JS entry (native/entry.ts, imported by index.ts).
import { registerPushDevice } from '@/data/devices';
import { ensureDatabaseReady } from '@/data/migrate';
import { hydrateSharedProperties, refreshSharedProperties } from '@/data/properties-client';
import { hydrateSyncStatus, syncNow } from '@/data/sync-client';
import { todayStore } from '@/data/time';
import { startUploadQueue } from '@/data/upload-queue';

import { registerBackgroundTasks } from './background';
import { addNotificationOpenListener, setupNotifications } from './notifications';
import { pendingOpenUrl, takePendingOpenUrl } from './status-actions';
import { refreshSurfaces, runMaintenance, startSurfaceWatcher } from './surfaces';

export { refreshSurfaces as syncNativeSurfaces, runMaintenance } from './surfaces';

let boot: Promise<void> | null = null;

/**
 * Idempotent start sequence: migrate, notification channels / categories, background task
 * registration, reminders + Live Activity / Live Update + widgets, then (when signed in) sync,
 * shared-property memberships and the push token.
 */
export function initializeNativeServices(): Promise<void> {
  if (!boot) {
    boot = (async () => {
      await ensureDatabaseReady();
      hydrateSharedProperties();
      hydrateSyncStatus();
      await setupNotifications().catch((e) => console.warn('[surface-sync] notification setup failed', e));
      await registerBackgroundTasks();
      await runMaintenance().catch((e) => console.warn('[surface-sync] maintenance failed', e));
      void (async () => {
        await syncNow();
        await refreshSharedProperties().catch(() => undefined);
        await registerPushDevice().catch(() => undefined);
      })();
    })().catch((error) => {
      boot = null;
      throw error;
    });
  }
  return boot;
}

export type NativeServicesOptions = {
  /**
   * A tap that should navigate: `turnproof://turnover/<id>` (reminders, the status surface,
   * widgets, "Start"), `turnproof://turnover/<id>?issue=1` ("Issue"), `turnproof://today`.
   * Typically `(url) => router.push(url)`; Expo Router also handles these links itself when the
   * OS opens them.
   */
  onOpenUrl?: (url: string) => void;
};

/**
 * Root layout: `useEffect(() => (db.success ? startNativeServices({ onOpenUrl }) : undefined), [db.success])`.
 * Runs `initializeNativeServices`, starts the photo upload queue, re-runs maintenance on every
 * return to the foreground and at local midnight, and forwards notification / Live Activity taps
 * to `onOpenUrl` (including the one that cold-launched the app). Returns a cleanup function.
 */
export function startNativeServices(opts: NativeServicesOptions = {}): () => void {
  let disposed = false;
  const forwardPending = () => {
    if (disposed) return;
    const url = takePendingOpenUrl();
    if (url) opts.onOpenUrl?.(url);
  };
  let stopUploads: () => void = () => undefined;
  initializeNativeServices()
    .then(() => {
      if (disposed) return;
      stopUploads = startUploadQueue();
      forwardPending();
    })
    .catch((e) => console.warn('[surface-sync] start failed', e));

  const stopWatcher = startSurfaceWatcher();
  const offOpen = addNotificationOpenListener((url) => opts.onOpenUrl?.(url));
  const offPending = pendingOpenUrl.subscribe(forwardPending);

  let day = todayStore.getSnapshot();
  const offDay = todayStore.subscribe(() => {
    const next = todayStore.getSnapshot();
    if (next === day) return;
    day = next;
    refreshSurfaces().catch(() => undefined);
  });

  return () => {
    disposed = true;
    stopWatcher();
    stopUploads();
    offOpen();
    offPending();
    offDay();
  };
}
