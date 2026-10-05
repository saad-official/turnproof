// Device time zone, "today", and ticking clocks for hooks whose result depends on the time
// (countdowns, overdue badges, the elapsed timer of a running turnover).
import { addDaysToKey, type DayKey, dayKeyOf, zonedMidnight } from '@turnproof/shared';
import { getCalendars } from 'expo-localization';
import { AppState } from 'react-native';

import { createStore, type Store, useStore } from './store';

/** IANA zone of the device right now (re-read every call: people travel). */
export function deviceTimeZone(): string {
  try {
    const tz = getCalendars()[0]?.timeZone;
    if (tz) return tz;
  } catch {
    // fall through
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export const nowIso = () => new Date().toISOString();

export function todayKey(tz = deviceTimeZone(), at: number = Date.now()): DayKey {
  return dayKeyOf(at, tz);
}

/** UTC ISO bounds `[start, end)` of local day `key` (for `scheduled_for` range queries). */
export function dayBounds(key: DayKey, tz = deviceTimeZone()): { start: string; end: string } {
  return {
    start: new Date(zonedMidnight(key, tz)).toISOString(),
    end: new Date(zonedMidnight(addDaysToKey(key, 1), tz)).toISOString(),
  };
}

/** Local time `HH:mm` → `8:00 PM` / `20:00` per device locale. */
export function formatClock(iso: string, tz = deviceTimeZone()): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(
      new Date(Date.parse(iso)),
    );
  } catch {
    return iso.slice(11, 16);
  }
}

// ---------------------------------------------------------------------------
// Ticking stores. Timers start with the first subscriber and stop with the last, and both
// re-sync when the app returns to the foreground (JS timers do not run in the background).

function tickingStore<T>(read: () => T, schedule: (fire: () => void) => () => void, equal: (a: T, b: T) => boolean): Store<T> {
  const inner = createStore<T>(read());
  let stop: (() => void) | null = null;
  let appSub: { remove(): void } | null = null;
  let count = 0;
  const refresh = () => {
    const next = read();
    if (!equal(inner.getSnapshot(), next)) inner.setState(next);
  };
  const start = () => {
    stop = schedule(() => {
      refresh();
      stop?.();
      start();
    });
  };
  return {
    getSnapshot: inner.getSnapshot,
    setState: inner.setState,
    subscribe(listener) {
      const unsub = inner.subscribe(listener);
      if (count++ === 0) {
        refresh();
        start();
        appSub = AppState.addEventListener('change', (s) => {
          if (s === 'active') refresh();
        });
      }
      return () => {
        unsub();
        if (--count === 0) {
          stop?.();
          stop = null;
          appSub?.remove();
          appSub = null;
        }
      };
    },
  };
}

const TICK_MS = 30_000;

/** Floors `Date.now()` to 30 s: countdowns and overdue badges re-evaluate on each tick. */
export const clockTick: Store<number> = tickingStore(
  () => Math.floor(Date.now() / TICK_MS) * TICK_MS,
  (fire) => {
    const id = setTimeout(fire, TICK_MS - (Date.now() % TICK_MS) + 50);
    return () => clearTimeout(id);
  },
  (a, b) => a === b,
);

/** Local day key, flipping at local midnight. */
export const todayStore: Store<DayKey> = tickingStore(
  () => todayKey(),
  (fire) => {
    const tz = deviceTimeZone();
    const next = zonedMidnight(addDaysToKey(todayKey(tz), 1), tz);
    // Cap the wait so a time-zone change or clock jump is noticed within an hour.
    const id = setTimeout(fire, Math.min(Math.max(next - Date.now() + 250, 1000), 3_600_000));
    return () => clearTimeout(id);
  },
  (a, b) => a === b,
);

/** Current local day key; re-renders at local midnight (and on return to the foreground). */
export function useToday(): DayKey {
  return useStore(todayStore);
}

/** Epoch ms floored to 30 s; re-renders every 30 s while mounted. */
export function useClockTick(): number {
  return useStore(clockTick);
}

const SECOND_MS = 1000;

/** Epoch ms floored to 1 s (the running turnover's elapsed timer). */
export const secondTick: Store<number> = tickingStore(
  () => Math.floor(Date.now() / SECOND_MS) * SECOND_MS,
  (fire) => {
    const id = setTimeout(fire, SECOND_MS - (Date.now() % SECOND_MS) + 10);
    return () => clearTimeout(id);
  },
  (a, b) => a === b,
);

/** Epoch ms floored to 1 s; re-renders every second while mounted (use only on the turnover screen). */
export function useSecondTick(): number {
  return useStore(secondTick);
}
