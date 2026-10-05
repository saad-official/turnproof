// Read models for screens and native surfaces: a turnover with its property, live progress (shared
// `turnoverProgress`), elapsed time, countdown and overdue flag. Pure reads; hooks wrap them.
import {
  countdownLabel,
  elapsedSeconds,
  isOverdue,
  type Property,
  roomProgress,
  type RoomProgress,
  roomStateFor,
  type Turnover,
  type TurnoverProgress,
  turnoverProgress,
  upcomingTurnovers,
} from '@turnproof/shared';

import { getActiveTurnover } from './local-runs';
import { getProperties, getProperty } from './properties-repo';
import { dayBounds, deviceTimeZone, todayKey } from './time';
import { getTurnover, listTurnoversBetween, listTurnoversByStatus } from './turnovers-repo';

export type TurnoverView = Turnover & {
  /** Null when the property was deleted (history rows keep their turnover). */
  property: Property | null;
  /** Shared `turnoverProgress` (rooms done/total, items, photos, current room, next incomplete). */
  progress: TurnoverProgress | null;
  /** Seconds worked (live while running, frozen once closed). */
  elapsedSeconds: number;
  /** Scheduled, not started, and past its time. */
  overdue: boolean;
  /** "in 1 h 20 min" / "now" / "overdue 15 min" (scheduled ones), else null. */
  countdown: string | null;
  /** Per-room progress in walk-through order (empty without a property). */
  rooms: (RoomProgress & { roomId: string; name: string; index: number; current: boolean; doneAt: string | null })[];
};

/** Enriches a turnover at `now` (default: now). `property` may be passed to skip a lookup. */
export function toTurnoverView(t: Turnover, now: string = new Date().toISOString(), property?: Property | null): TurnoverView {
  const p = property === undefined ? getProperty(t.propertyId) : property;
  const progress = p ? turnoverProgress(p, t) : null;
  return {
    ...t,
    property: p,
    progress,
    elapsedSeconds: elapsedSeconds(t, now),
    overdue: isOverdue(t, now),
    countdown: t.status === 'scheduled' ? countdownLabel(t.scheduledFor, now) : null,
    rooms: p
      ? p.rooms.map((room, index) => {
          const state = roomStateFor(t, room.id);
          return {
            ...roomProgress(room, state),
            roomId: room.id,
            name: room.name,
            index,
            current: progress?.currentRoomIndex === index,
            doneAt: state?.doneAt ?? null,
          };
        })
      : [],
  };
}

export function turnoverView(id: string, now?: string): TurnoverView | null {
  const t = getTurnover(id);
  return t && !t.deletedAt ? toTurnoverView(t, now) : null;
}

function withProperties(list: readonly Turnover[], now: string): TurnoverView[] {
  const props = new Map(getProperties([...new Set(list.map((t) => t.propertyId))]).map((p) => [p.id, p]));
  return list.map((t) => toTurnoverView(t, now, props.get(t.propertyId) ?? null));
}

/**
 * Shared `upcomingTurnovers`: scheduled turnovers whose local day is today … today + days − 1
 * (overdue ones from earlier today included) plus every running one, by time. Turnovers of deleted
 * properties are left out.
 */
export function upcomingTurnoverViews(days = 7, now: string = new Date().toISOString()): TurnoverView[] {
  const tz = deviceTimeZone();
  const { start } = dayBounds(todayKey(tz, Date.parse(now)), tz);
  const until = new Date(Date.parse(start) + (days + 1) * 86_400_000).toISOString();
  const candidates = [...listTurnoversBetween(start, until), ...listTurnoversByStatus(['in-progress'])];
  const unique = [...new Map(candidates.map((t) => [t.id, t])).values()];
  return withProperties(upcomingTurnovers(unique, now, tz, days), now).filter((v) => v.property && !v.property.deletedAt);
}

/** Turnovers scheduled in `[from, to)` (history by month, calendar), as views. */
export function turnoverViewsBetween(from: string, to: string, propertyId?: string, now: string = new Date().toISOString()): TurnoverView[] {
  return withProperties(listTurnoversBetween(from, to, propertyId), now);
}

/** The turnover running on this device, as a view. */
export function activeTurnoverView(now?: string): TurnoverView | null {
  const t = getActiveTurnover();
  return t ? toTurnoverView(t, now) : null;
}
