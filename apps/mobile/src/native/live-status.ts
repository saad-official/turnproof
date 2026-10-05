// Default (web) implementation: no system status surface, but notification actions still flow
// through `addStatusActionListener`. iOS: live-status.ios.ts, Android: live-status.android.ts.
import { notificationStatusListener } from './live-status.shared';
import type { StatusActionListener, TurnoverStatusView } from './live-status.types';

export type { StatusAction, StatusActionListener, StatusActionSource, TurnoverStatusView } from './live-status.types';

/**
 * Shows, updates or ends the "turnover in progress" surface: iOS Live Activity `Turnover`, Android
 * 16 Live Update, or an ongoing notification below Android 16. `null` ends it.
 */
export async function syncTurnoverStatus(_status: TurnoverStatusView | null): Promise<void> {}

/** Unified Next room / Issue / Start / Snooze events from every surface. Returns unsubscribe. */
export function addStatusActionListener(listener: StatusActionListener): () => void {
  return notificationStatusListener(listener);
}
