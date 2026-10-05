// Deletes every row of every table (used by "Delete all local data").
import { db } from './db';
import { issues, photos, properties, proofs, settings, syncState, turnovers } from './schema';
import { notifyTables, TABLES } from './store';

export function wipeAllTables(): void {
  db.transaction((tx) => {
    for (const table of [photos, issues, proofs, turnovers, properties, settings, syncState]) tx.delete(table).run();
  });
  notifyTables(...TABLES);
}
