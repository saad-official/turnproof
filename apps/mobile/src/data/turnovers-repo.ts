// Turnovers (room states as JSON). Soft deletes so they sync.
import type { Turnover } from '@turnproof/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';

import { db } from './db';
import { fromTurnover, toTurnover } from './mappers';
import { turnovers } from './schema';
import { notifyTables } from './store';

export function getTurnover(id: string): Turnover | null {
  const row = db.select().from(turnovers).where(eq(turnovers.id, id)).get();
  return row ? toTurnover(row) : null;
}

/** Live turnovers scheduled in `[from, to)` (ISO), by scheduled time. */
export function listTurnoversBetween(from: string, to: string, propertyId?: string): Turnover[] {
  const where = and(
    isNull(turnovers.deletedAt),
    gte(turnovers.scheduledFor, from),
    lt(turnovers.scheduledFor, to),
    propertyId ? eq(turnovers.propertyId, propertyId) : undefined,
  );
  return db.select().from(turnovers).where(where).orderBy(asc(turnovers.scheduledFor)).all().map(toTurnover);
}

/** Live turnovers with one of `statuses`, by scheduled time. */
export function listTurnoversByStatus(statuses: readonly Turnover['status'][], propertyId?: string): Turnover[] {
  const where = and(
    isNull(turnovers.deletedAt),
    inArray(turnovers.status, [...statuses]),
    propertyId ? eq(turnovers.propertyId, propertyId) : undefined,
  );
  return db.select().from(turnovers).where(where).orderBy(asc(turnovers.scheduledFor)).all().map(toTurnover);
}

/** Every live turnover of a property, newest first (history). */
export function listTurnoversForProperty(propertyId: string): Turnover[] {
  return db
    .select()
    .from(turnovers)
    .where(and(isNull(turnovers.deletedAt), eq(turnovers.propertyId, propertyId)))
    .orderBy(desc(turnovers.scheduledFor))
    .all()
    .map(toTurnover);
}

/** Every live turnover, newest scheduled first (history, CSV export). */
export function listAllTurnovers(): Turnover[] {
  return db.select().from(turnovers).where(isNull(turnovers.deletedAt)).orderBy(desc(turnovers.scheduledFor)).all().map(toTurnover);
}

/** The running turnover (most recently started), if any. */
export function getActiveTurnoverRow(): Turnover | null {
  const row = db
    .select()
    .from(turnovers)
    .where(and(isNull(turnovers.deletedAt), eq(turnovers.status, 'in-progress')))
    .orderBy(desc(turnovers.startedAt))
    .get();
  return row ? toTurnover(row) : null;
}

/** Every row including soft-deleted ones (sync). */
export function allTurnoverRows(): Turnover[] {
  return db.select().from(turnovers).all().map(toTurnover);
}

export function putTurnovers(list: readonly Turnover[]): void {
  if (!list.length) return;
  db.transaction((tx) => {
    for (const t of list) {
      const row = fromTurnover(t);
      tx.insert(turnovers).values(row).onConflictDoUpdate({ target: turnovers.id, set: row }).run();
    }
  });
  notifyTables('turnovers');
}

export function saveTurnover(t: Turnover): Turnover {
  putTurnovers([t]);
  return t;
}
