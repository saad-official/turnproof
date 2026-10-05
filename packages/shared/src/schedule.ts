import type { Property, Turnover } from "./schemas";
import { addDaysToKey, type DayKey, dayKeyOf, type IsoString, zonedInstant } from "./tz";

/** "45 min", "1 h 20 min", "2 d 3 h" (days drop the minutes). */
export function formatMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.floor(totalMinutes));
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
  return `${mins} min`;
}

/**
 * "in 1 h 20 min" before `scheduledFor` (partial minutes round up), "now" for the first overdue
 * minute, then "overdue 15 min".
 */
export function countdownLabel(scheduledFor: IsoString, now: IsoString): string {
  const diff = Date.parse(scheduledFor) - Date.parse(now);
  if (diff > 0) return `in ${formatMinutes(Math.ceil(diff / 60_000))}`;
  const overdue = Math.floor(-diff / 60_000);
  return overdue < 1 ? "now" : `overdue ${formatMinutes(overdue)}`;
}

export interface TurnoverWindow {
  checkoutAt: IsoString;
  checkinAt: IsoString;
}

/**
 * The turnover window on local day `dayKey`: the property's checkout and next check-in instants
 * (DST-safe). A check-in time not after checkout is taken as the next day.
 */
export function turnoverWindow(property: Property, dayKey: DayKey, tz: string): TurnoverWindow {
  const checkout = zonedInstant(dayKey, property.checkoutTime, tz);
  let checkin = zonedInstant(dayKey, property.checkinTime, tz);
  if (checkin <= checkout) checkin = zonedInstant(addDaysToKey(dayKey, 1), property.checkinTime, tz);
  return { checkoutAt: new Date(checkout).toISOString(), checkinAt: new Date(checkin).toISOString() };
}

/**
 * When to remind: `leadMinutes` before the property's checkout time on the turnover's local day
 * (day of `scheduledFor` in `tz`). Null unless the turnover is scheduled and not deleted.
 */
export function reminderAt(turnover: Turnover, property: Property, leadMinutes: number, tz: string): IsoString | null {
  if (turnover.status !== "scheduled" || turnover.deletedAt) return null;
  const checkout = zonedInstant(dayKeyOf(turnover.scheduledFor, tz), property.checkoutTime, tz);
  return new Date(checkout - leadMinutes * 60_000).toISOString();
}

/** A scheduled (not started) turnover whose time has passed. */
export function isOverdue(turnover: Turnover, now: IsoString): boolean {
  return turnover.status === "scheduled" && !turnover.deletedAt && Date.parse(now) > Date.parse(turnover.scheduledFor);
}

const byScheduled = (a: { scheduledFor: IsoString }, b: { scheduledFor: IsoString }) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor);

/**
 * What's coming up: scheduled turnovers whose local day is today … today + days − 1 (earlier-today
 * overdue ones included), plus any in-progress turnover whatever its date. Sorted by `scheduledFor`.
 */
export function upcomingTurnovers(turnovers: readonly Turnover[], now: IsoString, tz: string, days = 7): Turnover[] {
  const today = dayKeyOf(now, tz);
  const end = addDaysToKey(today, days);
  return turnovers
    .filter((t) => {
      if (t.deletedAt) return false;
      if (t.status === "in-progress") return true;
      if (t.status !== "scheduled") return false;
      const day = dayKeyOf(t.scheduledFor, tz);
      return day >= today && day < end;
    })
    .sort(byScheduled);
}

export interface DayGroup<T extends { scheduledFor: IsoString } = Turnover> {
  dayKey: DayKey;
  turnovers: T[];
}

/**
 * Items grouped by local day of `scheduledFor`, days and rows in time order. Works for turnovers
 * and for any view that carries a `scheduledFor` (the items are returned as given).
 */
export function groupByDay<T extends { scheduledFor: IsoString }>(turnovers: readonly T[], tz: string): DayGroup<T>[] {
  const groups = new Map<DayKey, T[]>();
  for (const t of [...turnovers].sort(byScheduled)) {
    const key = dayKeyOf(t.scheduledFor, tz);
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([dayKey, list]) => ({ dayKey, turnovers: list }));
}
