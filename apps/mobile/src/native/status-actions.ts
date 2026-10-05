// Routes Next room / Issue / Start / Snooze from notifications, the Live Activity and the Live Update
// into actions.ts. Started at JS entry (index.ts) so presses that wake the app in the background
// are handled even when no screen is mounted.
import { goToNextRoom, startTurnover } from '@/data/actions';
import { getActiveTurnover } from '@/data/local-runs';
import { ensureDatabaseReady } from '@/data/migrate';
import { createStore } from '@/data/store';

import { haptics } from './haptics';
import { addStatusActionListener, type StatusAction } from './live-status';
import { consumeLaunchNotificationResponse, isStartable, snoozeTurnoverReminder, turnoverUrl } from './notifications';

/** A deep link to open once the UI can navigate (cold launch, or an "Issue" tap). */
export const pendingOpenUrl = createStore<string | null>(null);

/** Applies one status action. Exported for the Android background notification task. */
export async function handleStatusAction(event: StatusAction): Promise<void> {
  await ensureDatabaseReady();
  // Live Activity buttons act on the turnover running here now.
  const turnoverId = event.turnoverId ?? getActiveTurnover()?.id ?? null;
  if (!turnoverId) return;
  switch (event.action) {
    case 'next-room': {
      const r = await goToNextRoom(turnoverId);
      if (r.ok) haptics.roomChange();
      break;
    }
    case 'issue':
      pendingOpenUrl.setState(turnoverUrl(turnoverId, 'issue'));
      break;
    case 'start':
      if (isStartable(turnoverId)) {
        const r = await startTurnover(turnoverId);
        if (r.ok) haptics.started();
      }
      pendingOpenUrl.setState(turnoverUrl(turnoverId));
      break;
    case 'snooze':
      await snoozeTurnoverReminder(turnoverId);
      break;
  }
}

let started = false;

/** Idempotent. Subscribes the unified listener and handles the response that launched the app. */
export function startStatusActionHandling(): void {
  if (started) return;
  started = true;
  addStatusActionListener((event) => {
    handleStatusAction(event).catch((e) => console.warn('[status-actions] failed', event.action, e));
  });
  consumeLaunchNotificationResponse()
    .then(async (event) => {
      if (!event) return;
      if (event.action === 'open') {
        if (event.url) pendingOpenUrl.setState(event.url);
        return;
      }
      await handleStatusAction({ action: event.action, turnoverId: event.turnoverId, source: 'notification' });
    })
    .catch(() => undefined);
}

/** Returns (and clears) the deep link waiting for the UI, if any. */
export function takePendingOpenUrl(): string | null {
  const url = pendingOpenUrl.getSnapshot();
  if (url) pendingOpenUrl.setState(null);
  return url;
}
