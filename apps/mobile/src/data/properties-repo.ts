// Properties (rooms + checklist items + supplies as JSON). Soft deletes (`deletedAt`) so they sync.
import type { Property } from '@turnproof/shared';
import { asc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from './db';
import { fromProperty, toProperty } from './mappers';
import { properties } from './schema';
import { notifyTables } from './store';

export function getProperty(id: string): Property | null {
  const row = db.select().from(properties).where(eq(properties.id, id)).get();
  return row ? toProperty(row) : null;
}

export function getProperties(ids: readonly string[]): Property[] {
  if (!ids.length) return [];
  return db.select().from(properties).where(inArray(properties.id, [...ids])).all().map(toProperty);
}

/** Live (not deleted) properties by name. */
export function listProperties(): Property[] {
  return db.select().from(properties).where(isNull(properties.deletedAt)).orderBy(asc(properties.name)).all().map(toProperty);
}

/** Every row including soft-deleted ones (sync push / pull merge). */
export function allPropertyRows(): Property[] {
  return db.select().from(properties).all().map(toProperty);
}

/** Inserts or replaces properties (validated JSON), in one transaction. */
export function putProperties(list: readonly Property[]): void {
  if (!list.length) return;
  db.transaction((tx) => {
    for (const p of list) {
      const row = fromProperty(p);
      tx.insert(properties).values(row).onConflictDoUpdate({ target: properties.id, set: row }).run();
    }
  });
  notifyTables('properties');
}

export function saveProperty(p: Property): Property {
  putProperties([p]);
  return p;
}
