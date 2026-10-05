import { secondTick, clockTick } from '@/data/time';
import { useLiveQuery, useStore } from '@/data/store';
import { activeTurnoverView, type TurnoverView, turnoverView, turnoverViewsBetween, upcomingTurnoverViews } from '@/data/views';

const EMPTY: TurnoverView[] = [];
const TURNOVER_TABLES = ['turnovers', 'properties', 'settings'] as const;

type TickOptions = {
  /** Re-evaluate every second (the running turnover's elapsed timer). Default: every 30 s. */
  everySecond?: boolean;
};

function useTick(opts: TickOptions | undefined): number {
  return useStore(opts?.everySecond ? secondTick : clockTick);
}

/**
 * Upcoming turnovers (shared `upcomingTurnovers`): scheduled ones whose local day is today …
 * today + days − 1 (earlier-today overdue ones included) plus every running one, by time. Each is a
 * `TurnoverView` with `property`, `progress`, `countdown`, `overdue`, `elapsedSeconds`, `rooms`.
 */
export function useUpcomingTurnovers(days = 7): TurnoverView[] {
  const tick = useTick(undefined);
  return useLiveQuery(`upcoming:${days}`, TURNOVER_TABLES, () => upcomingTurnoverViews(days, new Date(tick).toISOString()), EMPTY, String(tick));
}

/**
 * One turnover with live progress (shared `turnoverProgress`), per-room progress, elapsed time and
 * countdown; null when missing or deleted. Pass `{ everySecond: true }` on the running screen.
 */
export function useTurnover(id: string | null | undefined, opts?: TickOptions): TurnoverView | null {
  const tick = useTick(opts);
  return useLiveQuery(
    `turnover:${id ?? ''}`,
    TURNOVER_TABLES,
    () => (id ? turnoverView(id, new Date(tick).toISOString()) : null),
    null,
    String(tick),
  );
}

/** The turnover running on this device (what the Live Activity shows), or null. */
export function useActiveTurnover(opts?: TickOptions): TurnoverView | null {
  const tick = useTick(opts);
  return useLiveQuery('active-turnover', TURNOVER_TABLES, () => activeTurnoverView(new Date(tick).toISOString()), null, String(tick));
}

/** Turnovers scheduled in `[from, to)` (ISO; e.g. a month for History), optionally one property's. */
export function useTurnoversBetween(from: string, to: string, propertyId?: string | null): TurnoverView[] {
  const tick = useTick(undefined);
  return useLiveQuery(
    `between:${from}:${to}:${propertyId ?? ''}`,
    TURNOVER_TABLES,
    () => turnoverViewsBetween(from, to, propertyId ?? undefined, new Date(tick).toISOString()),
    EMPTY,
    String(tick),
  );
}
