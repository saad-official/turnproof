// Android: Live Update (expo-live-updates) on Android 16+ with one progress segment per room, an
// ongoing notification ("Next room" / "Issue" actions) below that.
import { addNotificationStateChangeListener, startLiveUpdate, stopLiveUpdate, updateLiveUpdate } from 'expo-live-updates';
// The package index does not re-export its state/config types.
import type { LiveUpdateConfig, LiveUpdateState } from 'expo-live-updates/build/types';
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

import { notificationStatusListener } from './live-status.shared';
import { statusLine, type StatusActionListener, type TurnoverStatusView } from './live-status.types';
import { dismissLiveStatusNotification, getNotificationPermission, presentLiveStatusNotification } from './notifications';

export type { StatusAction, StatusActionListener, StatusActionSource, TurnoverStatusView } from './live-status.types';

// Live Updates exist from API 36 (promoted to the status-bar chip on 36.1+).
const LIVE_UPDATES_MIN_API = 36;
const usesLiveUpdates = () => Number(Platform.Version) >= LIVE_UPDATES_MIN_API;

// The notification id must survive an app kill, or the Live Update could never be stopped.
const STATE_KEY = 'turnproof.liveUpdate.turnover';
type Stored = { id: number; turnoverId: string };

function stored(): Stored | null {
  try {
    const raw = Storage.getItemSync(STATE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function remember(value: Stored | null): void {
  try {
    if (value) Storage.setItemSync(STATE_KEY, JSON.stringify(value));
    else Storage.removeItemSync(STATE_KEY);
  } catch {
    // best effort
  }
}

function toLiveUpdate(v: TurnoverStatusView): { state: LiveUpdateState; config: LiveUpdateConfig } {
  const c = v.palette.light;
  const segments = v.roomDone.length
    ? v.roomDone.map((done) => ({ length: 1, color: done ? c.accent : c.track }))
    : [{ length: 1, color: c.accent }];
  return {
    state: {
      title: v.propertyName,
      text: statusLine(v),
      subText: 'Turnover in progress',
      progress: { max: Math.max(1, v.roomsTotal), progress: v.roomsDone, segments },
      // Status-bar chip (≤ 7 characters).
      shortCriticalText: `${v.roomsDone}/${v.roomsTotal}`,
      // Chronometer from the start time (elapsed).
      showTime: true,
      time: Date.parse(v.startedAt),
    },
    config: { deepLinkUrl: v.url, iconBackgroundColor: c.accent },
  };
}

function stopStored(): void {
  const prev = stored();
  if (prev) {
    try {
      stopLiveUpdate(prev.id);
    } catch {
      // already gone
    }
  }
  remember(null);
}

async function fallbackNotification(v: TurnoverStatusView): Promise<void> {
  await presentLiveStatusNotification({ turnoverId: v.turnoverId, title: v.propertyName, body: statusLine(v) });
}

export async function syncTurnoverStatus(status: TurnoverStatusView | null): Promise<void> {
  if (!status) {
    stopStored();
    await dismissLiveStatusNotification();
    return;
  }
  if ((await getNotificationPermission()).status !== 'granted') return;
  if (!usesLiveUpdates()) {
    await fallbackNotification(status);
    return;
  }
  const { state, config } = toLiveUpdate(status);
  const prev = stored();
  if (prev && prev.turnoverId === status.turnoverId) {
    try {
      updateLiveUpdate(prev.id, state, config);
      return;
    } catch (error) {
      console.warn('[live-status] updateLiveUpdate failed; restarting', error);
    }
  }
  stopStored();
  try {
    const id = startLiveUpdate(state, config);
    if (typeof id === 'number') remember({ id, turnoverId: status.turnoverId });
    else await fallbackNotification(status);
  } catch (error) {
    console.warn('[live-status] startLiveUpdate failed; using an ongoing notification', error);
    await fallbackNotification(status);
  }
}

/**
 * Live Update taps open `turnproof://turnover/<id>` (expo-live-updates 0.1 has no action buttons);
 * the fallback notification's Next room / Issue arrive through the notification listener.
 */
export function addStatusActionListener(listener: StatusActionListener): () => void {
  const liveSub = addNotificationStateChangeListener((event) => {
    if (event.action === 'dismissed' && stored()?.id === event.notificationId) remember(null);
  });
  const removeNotifications = notificationStatusListener(listener);
  return () => {
    liveSub?.remove();
    removeNotifications();
  };
}
