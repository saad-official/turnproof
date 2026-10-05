// What the home-screen / Lock Screen widgets show, built from SQLite (also from headless JS).
import { addDaysToKey, isOverdue, zonedMidnight } from '@turnproof/shared';

import { dayBounds, deviceTimeZone, formatClock, todayKey } from '@/data/time';
import { activeTurnoverView, turnoverViewsBetween, upcomingTurnoverViews } from '@/data/views';

export type WidgetSnapshot = {
  /** The next scheduled turnover (overdue ones from today included). */
  next: { turnoverId: string; propertyName: string; scheduledFor: string; checkoutLabel: string; overdue: boolean } | null;
  /** Turnovers on today's schedule (any status) and how many of them are finished. */
  todayTotal: number;
  todayDone: number;
  /** The turnover running on this device. */
  active: { turnoverId: string; propertyName: string; roomsDone: number; roomsTotal: number; currentRoom: string | null } | null;
};

/** Snapshot as it will look at `at` (default now) if nothing changes in the meantime. */
export function buildWidgetSnapshot(at: number = Date.now()): WidgetSnapshot {
  const now = new Date(at).toISOString();
  const tz = deviceTimeZone();
  const { start, end } = dayBounds(todayKey(tz, at), tz);
  const today = turnoverViewsBetween(start, end, undefined, now).filter((t) => t.property && !t.property.deletedAt && t.status !== 'abandoned');
  const next = upcomingTurnoverViews(7, now).find((t) => t.status === 'scheduled') ?? null;
  const active = activeTurnoverView(now);
  return {
    next:
      next && next.property
        ? {
            turnoverId: next.id,
            propertyName: next.property.name,
            scheduledFor: next.scheduledFor,
            checkoutLabel: formatClock(next.scheduledFor, tz),
            overdue: isOverdue(next, now),
          }
        : null,
    todayTotal: today.length,
    todayDone: today.filter((t) => t.status === 'finished').length,
    active:
      active && active.property && active.progress
        ? {
            turnoverId: active.id,
            propertyName: active.property.name,
            roomsDone: active.progress.roomsDone,
            roomsTotal: active.progress.roomsTotal,
            currentRoom: active.progress.currentRoomName,
          }
        : null,
  };
}

/** Instants after now when the widget changes by itself: next checkouts (countdown → overdue) and local midnights. */
export function upcomingChangeInstants(limit = 12): number[] {
  const now = Date.now();
  const tz = deviceTimeZone();
  const today = todayKey(tz, now);
  const midnights = [1, 2].map((d) => zonedMidnight(addDaysToKey(today, d), tz));
  const checkouts = upcomingTurnoverViews(2)
    .filter((t) => t.status === 'scheduled')
    .map((t) => Date.parse(t.scheduledFor));
  return [...new Set([...checkouts, ...midnights])]
    .filter((t) => t > now)
    .sort((a, b) => a - b)
    .slice(0, limit);
}
