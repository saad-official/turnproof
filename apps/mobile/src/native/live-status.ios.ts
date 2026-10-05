// iOS: the `Turnover` Live Activity (expo-widgets) on the Lock Screen / Dynamic Island.
import Storage from 'expo-sqlite/kv-store';
import { addUserInteractionListener, type LiveActivity } from 'expo-widgets';

import TurnoverActivity, { type TurnoverActivityProps } from '@/widgets/turnover.activity';

import { notificationStatusListener } from './live-status.shared';
import type { StatusActionListener, TurnoverStatusView } from './live-status.types';

export type { StatusAction, StatusActionListener, StatusActionSource, TurnoverStatusView } from './live-status.types';

// Survives app restarts: Live Activities outlive the JS runtime.
const STATE_KEY = 'turnproof.liveActivity.turnover';

type Stored = { turnoverId: string };

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

function toProps(v: TurnoverStatusView): TurnoverActivityProps {
  const pick = (c: TurnoverStatusView['palette']['light']) => ({
    surface: c.surface,
    text: c.text,
    textSecondary: c.textSecondary,
    accent: c.accent,
    accentText: c.accentText,
    issue: c.issue,
  });
  return {
    propertyName: v.propertyName,
    startedAtMs: Date.parse(v.startedAt),
    roomsDone: v.roomsDone,
    roomsTotal: v.roomsTotal,
    currentRoom: v.currentRoom,
    currentRoomNumber: v.currentRoomNumber,
    issueUrl: v.issueUrl,
    palette: { light: pick(v.palette.light), dark: pick(v.palette.dark) },
  };
}

function instances(): LiveActivity<TurnoverActivityProps>[] {
  try {
    return TurnoverActivity.getInstances();
  } catch {
    return [];
  }
}

async function endAll(): Promise<void> {
  await Promise.all(instances().map((a) => a.end('default').catch(() => undefined)));
  remember(null);
}

export async function syncTurnoverStatus(status: TurnoverStatusView | null): Promise<void> {
  if (!status) {
    await endAll();
    return;
  }
  const props = toProps(status);
  const prev = stored();
  const [current, ...extra] = instances();
  await Promise.all(extra.map((a) => a.end('immediate').catch(() => undefined)));
  if (current && prev?.turnoverId === status.turnoverId) {
    try {
      await current.update(props);
      return;
    } catch (error) {
      console.warn('[live-status] Live Activity update failed', error);
    }
  }
  if (current) await current.end('immediate').catch(() => undefined);
  try {
    // Starting needs the app in the foreground (no push-to-start in v0.1).
    TurnoverActivity.start(props, status.url);
    remember({ turnoverId: status.turnoverId });
  } catch (error) {
    // Live Activities off in Settings, app in background, or the system limit.
    console.warn('[live-status] Live Activity start failed', error);
    remember(null);
  }
}

export function addStatusActionListener(listener: StatusActionListener): () => void {
  const sub = addUserInteractionListener((event) => {
    if (event.target !== 'next-room' && event.target !== 'issue') return;
    listener({ action: event.target, turnoverId: stored()?.turnoverId ?? null, source: 'live-activity' });
  });
  const removeNotifications = notificationStatusListener(listener);
  return () => {
    sub.remove();
    removeNotifications();
  };
}
