// Background work. Task definitions must run at module scope of the JS entry (index.ts): the OS can
// start a headless JS runtime that never renders the root layout.
//  - TURNPROOF_DAILY (expo-background-task): reschedule reminders, refresh widgets and the status
//    surface, sync, and kick the photo upload queue.
//  - TURNPROOF_NOTIFICATION_ACTIONS (expo-notifications): Android runs it for action-button taps
//    (Snooze / Next room) while the app is backgrounded or killed.
import * as BackgroundTask from 'expo-background-task';
import type { NotificationTaskPayload } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { ensureDatabaseReady } from '@/data/migrate';
import { syncNow } from '@/data/sync-client';
import { kickUploadQueue } from '@/data/upload-queue';

import { claimNotificationResponse } from './notifications';
import { handleStatusAction } from './status-actions';
import { runMaintenance } from './surfaces';

export const DAILY_TASK = 'TURNPROOF_DAILY';
export const NOTIFICATION_TASK = 'TURNPROOF_NOTIFICATION_ACTIONS';
/** Minutes. Android WorkManager's floor is 15; the OS decides the real cadence. */
const DAILY_INTERVAL_MINUTES = 12 * 60;

export function defineBackgroundTasks(): void {
  if (!TaskManager.isTaskDefined(DAILY_TASK)) {
    TaskManager.defineTask(DAILY_TASK, async () => {
      try {
        await ensureDatabaseReady();
        await syncNow();
        await runMaintenance();
        kickUploadQueue();
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch (error) {
        console.warn('[background] daily task failed', error);
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });
  }
  if (!TaskManager.isTaskDefined(NOTIFICATION_TASK)) {
    TaskManager.defineTask<NotificationTaskPayload>(NOTIFICATION_TASK, async ({ data, error }) => {
      if (error || !data || !('actionIdentifier' in data)) return;
      const event = claimNotificationResponse(data);
      if (!event || event.action === 'open') return;
      await handleStatusAction({ action: event.action, turnoverId: event.turnoverId, source: 'notification' });
    });
  }
}

/** Registers both tasks with the OS. Call once at app start; safe to repeat. */
export async function registerBackgroundTasks(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Available && !(await TaskManager.isTaskRegisteredAsync(DAILY_TASK))) {
      await BackgroundTask.registerTaskAsync(DAILY_TASK, { minimumInterval: DAILY_INTERVAL_MINUTES });
    }
  } catch (error) {
    console.warn('[background] daily task registration failed', error);
  }
  if (Platform.OS === 'android') {
    try {
      await Notifications.registerTaskAsync(NOTIFICATION_TASK);
    } catch (error) {
      console.warn('[background] notification task registration failed', error);
    }
  }
}

/** Dev only: run the daily task now (debug builds). */
export function triggerDailyTaskForTesting(): Promise<boolean> {
  return BackgroundTask.triggerTaskWorkerForTestingAsync();
}
