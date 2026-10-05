// Device database (expo-sqlite + drizzle). Everything here is synchronous so headless JS (widget
// handler, background task, notification actions, Live Activity buttons) can share one connection.
// The connection opens lazily on the first query, so importing data modules at the JS entry is free.
//
// Not encrypted: the data is turnover checklists and photo metadata (the photos themselves are
// plain files in the document directory), and a proof is meant to be shared.
import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import * as schema from './schema';

export const DATABASE_NAME = 'turnproof.db';

let connection: SQLiteDatabase | null = null;
let orm: ExpoSQLiteDatabase<typeof schema> | null = null;

/** The raw expo-sqlite connection (opened on first use). */
export function getSqlite(): SQLiteDatabase {
  if (!connection) {
    const conn = openDatabaseSync(DATABASE_NAME);
    conn.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
    connection = conn;
  }
  return connection;
}

export function getDb(): ExpoSQLiteDatabase<typeof schema> {
  if (!orm) orm = drizzle(getSqlite(), { schema });
  return orm;
}

export type Database = ExpoSQLiteDatabase<typeof schema>;

/** Drizzle database (lazy proxy: the connection opens on the first query). */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
