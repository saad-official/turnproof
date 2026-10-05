// Keeps every system surface in line with the database: scheduled reminders, the "turnover in
// progress" Live Activity / Live Update, and widgets. Actions call `refreshSurfaces` after each write.
import { finalizeDeletedTurnovers } from '@/data/turnover-purge';
import { getTurnover } from '@/data/turnovers-repo';
import { isDatabaseReady } from '@/data/store';
import { activeTurnoverView } from '@/data/views';
import { kickUploadQueue } from '@/data/upload-queue';
import { AppState, type AppStateStatus } from 'react-native';

import { syncTurnoverStatus } from './live-status';
import { toTurnoverStatusView, type TurnoverStatusView } from './live-status.types';
import { addTurnoverNotificationReceivedListener, dismissReminderFor, rescheduleAll } from './notifications';
import { refreshWidgetsFromDatabase } from './widgets';

/** The status view of the turnover running on this device, or null. */
export function currentTurnoverStatus(): TurnoverStatusView | null {
  const view = activeTurnoverView();
  return view ? toTurnoverStatusView(view) : null;
}

/** Shows / updates / ends the Live Activity (iOS) or Live Update / ongoing notification (Android). */
export async function refreshTurnoverStatus(): Promise<void> {
  await syncTurnoverStatus(currentTurnoverStatus()).catch((e) => console.warn('[surfaces] syncTurnoverStatus failed', e));
}

export type RefreshOptions = { turnoverId?: string; skipNotifications?: boolean };

let chain: Promise<void> = Promise.resolve();

/**
 * Re-plans reminders (diffed), removes a delivered reminder of a turnover that is no longer
 * scheduled, syncs the status surface and refreshes widgets. Serialised; never throws.
 */
export function refreshSurfaces(opts: RefreshOptions = {}): Promise<void> {
  chain = chain.then(async () => {
    if (!isDatabaseReady()) return;
    const jobs: Promise<unknown>[] = [];
    if (!opts.skipNotifications) jobs.push(rescheduleAll());
    if (opts.turnoverId) {
      const t = getTurnover(opts.turnoverId);
      if (!t || t.deletedAt || t.status !== 'scheduled') jobs.push(dismissReminderFor(opts.turnoverId));
    }
    jobs.push(refreshTurnoverStatus());
    jobs.push(refreshWidgetsFromDatabase());
    const results = await Promise.allSettled(jobs);
    for (const r of results) if (r.status === 'rejected') console.warn('[surfaces] refresh failed', r.reason);
  });
  return chain;
}

/**
 * Launch / daily / foreground maintenance: everything above, finishing deletions whose undo window
 * closed while the app was not running, plus a nudge to the upload queue.
 */
export async function runMaintenance(): Promise<void> {
  await refreshSurfaces();
  if (isDatabaseReady()) await finalizeDeletedTurnovers();
  kickUploadQueue();
}

let watcher: { stop(): void } | null = null;

/**
 * While mounted: maintenance on every return to the foreground (a Live Activity can only start in
 * the foreground) and a widget / status refresh when a reminder or push arrives. Idempotent.
 */
export function startSurfaceWatcher(): () => void {
  if (watcher) return watcher.stop;
  const onChange = (state: AppStateStatus) => {
    if (state === 'active') runMaintenance().catch(() => undefined);
  };
  const appSub = AppState.addEventListener('change', onChange);
  const removeReceived = addTurnoverNotificationReceivedListener(() => {
    refreshSurfaces({ skipNotifications: true }).catch(() => undefined);
  });
  watcher = {
    stop: () => {
      appSub.remove();
      removeReceived();
      watcher = null;
    },
  };
  return watcher.stop;
}
