// Issues / damage reports (photo + note + severity), per turnover. Soft deletes so they sync.
import type { Issue } from '@turnproof/shared';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from './db';
import { fromIssue, toIssue } from './mappers';
import { issues } from './schema';
import { notifyTables } from './store';

export function getIssue(id: string): Issue | null {
  const row = db.select().from(issues).where(eq(issues.id, id)).get();
  return row ? toIssue(row) : null;
}

/** Live issues of a turnover (optionally one room), oldest first. */
export function listIssues(turnoverId: string, roomId?: string): Issue[] {
  return db
    .select()
    .from(issues)
    .where(and(eq(issues.turnoverId, turnoverId), isNull(issues.deletedAt), roomId ? eq(issues.roomId, roomId) : undefined))
    .orderBy(asc(issues.createdAt))
    .all()
    .map(toIssue);
}

/** Live issue count per turnover id (ids without issues are missing from the map). */
export function issueCountsByTurnover(turnoverIds: readonly string[]): Map<string, number> {
  if (!turnoverIds.length) return new Map();
  const rows = db
    .select({ id: issues.turnoverId, n: sql<number>`count(*)` })
    .from(issues)
    .where(and(inArray(issues.turnoverId, [...turnoverIds]), isNull(issues.deletedAt)))
    .groupBy(issues.turnoverId)
    .all();
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

/** Every row including soft-deleted ones (sync). */
export function allIssueRows(): Issue[] {
  return db.select().from(issues).all().map(toIssue);
}

export function putIssues(list: readonly Issue[]): void {
  if (!list.length) return;
  db.transaction((tx) => {
    for (const i of list) {
      const row = fromIssue(i);
      tx.insert(issues).values(row).onConflictDoUpdate({ target: issues.id, set: row }).run();
    }
  });
  notifyTables('issues');
}

export function saveIssue(i: Issue): Issue {
  putIssues([i]);
  return i;
}
