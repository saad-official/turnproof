// Display formatting shared by screens: wall-clock times, day labels, timers and durations.
// Device locale for numbers and dates; the device time zone for "today".
import { addDaysToKey, dayKeyOf, type DayKey, formatMinutes } from '@turnproof/shared';

import { deviceTimeZone, formatClock, todayKey } from '@/data';

const pad = (n: number) => String(n).padStart(2, '0');

/** `HH:mm` → a Date today at that local time (for the native time picker). */
export function hhmmToDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

/** Date → local `HH:mm`. */
export function toHhmm(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const clockFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** `HH:mm` → "11:00 AM" / "11:00" per device locale. */
export function formatHhmm(hhmm: string): string {
  try {
    return clockFormat.format(hhmmToDate(hhmm));
  } catch {
    return hhmm;
  }
}

/** A running timer: "4:05", "1:02:09". */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** The spoken form of a timer: "1 hour 2 minutes". */
export function elapsedSpoken(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (h > 0) parts.push(plural(h, 'hour'));
  parts.push(plural(m, 'minute'));
  return parts.join(' ');
}

/** A finished duration: "under 1 min", "45 min", "1 h 20 min". */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, totalSeconds ?? 0);
  if (s < 60) return 'under 1 min';
  return formatMinutes(Math.round(s / 60));
}

/** "3 rooms", "1 room". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortMonthFormat = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });

function keyToUtc(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

/** "Today", "Tomorrow", "Yesterday", else "Wed 8 Oct". */
export function dayLabel(key: DayKey, today: DayKey = todayKey()): string {
  if (key === today) return 'Today';
  if (key === addDaysToKey(today, 1)) return 'Tomorrow';
  if (key === addDaysToKey(today, -1)) return 'Yesterday';
  return dayFormat.format(keyToUtc(key));
}

/** "Wednesday 8 October". */
export function longDayLabel(key: DayKey): string {
  return longDayFormat.format(keyToUtc(key));
}

/** The local day label of an instant. */
export function dateLabel(iso: string, tz = deviceTimeZone()): string {
  return dayLabel(dayKeyOf(iso, tz));
}

/** "Today · 11:00 AM". */
export function dateTimeLabel(iso: string, tz = deviceTimeZone()): string {
  return `${dateLabel(iso, tz)} · ${formatClock(iso, tz)}`;
}

/** "October 2026" for a `YYYY-MM` month key. */
export function monthLabel(monthKey: string): string {
  return monthFormat.format(keyToUtc(`${monthKey}-01`));
}

/** "Oct" for a `YYYY-MM` month key. */
export function shortMonthLabel(monthKey: string): string {
  return shortMonthFormat.format(keyToUtc(`${monthKey}-01`));
}

/** The next `count` local days starting today. */
export function upcomingDays(count: number, today: DayKey = todayKey()): DayKey[] {
  return Array.from({ length: count }, (_, i) => addDaysToKey(today, i));
}
