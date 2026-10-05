// Settings: shared `Settings` fields (validated with `SettingsSchema`) stored one JSON value per key,
// plus app-local values under the `app.` prefix (device id, push token, last sync, cached members).
import { DEFAULT_SETTINGS, type Settings, SettingsSchema } from '@turnproof/shared';
import { eq, like } from 'drizzle-orm';

import { db } from './db';
import { settings } from './schema';
import { notifyTables } from './store';
import { nowIso } from './time';

const SETTING_KEYS = Object.keys(SettingsSchema.shape) as (keyof Settings)[];

function readAll(): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const row of db.select().from(settings).all()) {
    try {
      out.set(row.key, JSON.parse(row.value));
    } catch {
      // ignore a corrupt value; the default applies
    }
  }
  return out;
}

/** Current settings; every field falls back to its default when missing or invalid. */
export function getSettings(): Settings {
  const stored = readAll();
  const candidate: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) if (stored.has(key)) candidate[key] = stored.get(key);
  const parsed = SettingsSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  // Drop fields one by one until the rest validates, so one bad value never resets everything.
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const key of SETTING_KEYS) {
    if (!stored.has(key)) continue;
    const single = SettingsSchema.safeParse({ [key]: stored.get(key) });
    if (single.success) (out as Record<string, unknown>)[key] = single.data[key];
  }
  return out;
}

function write(entries: [string, unknown][]): void {
  const at = nowIso();
  db.transaction((tx) => {
    for (const [key, value] of entries) {
      if (value === undefined) {
        tx.delete(settings).where(eq(settings.key, key)).run();
        continue;
      }
      const row = { key, value: JSON.stringify(value), updatedAt: at };
      tx.insert(settings).values(row).onConflictDoUpdate({ target: settings.key, set: row }).run();
    }
  });
  notifyTables('settings');
}

/** Validates the merged result and stores the changed fields. Returns the new settings. */
export function updateSettings(patch: Partial<Settings>): Settings {
  const next = SettingsSchema.parse({ ...getSettings(), ...patch });
  write(SETTING_KEYS.filter((k) => k in patch).map((k) => [k, next[k]] as [string, unknown]));
  return next;
}

// ---------------------------------------------------------------------------
// App-local values (not part of shared Settings)

const appKey = (key: string) => `app.${key}`;

export function getAppValue<T>(key: string, fallback: T): T {
  const row = db.select().from(settings).where(eq(settings.key, appKey(key))).get();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

/** `undefined` removes the value. */
export function setAppValue(key: string, value: unknown): void {
  write([[appKey(key), value]]);
}

/**
 * One-time move of the old device-local UI preferences (`app.ui.appearance`,
 * `app.ui.proofExpiryDays`) into the typed `Settings` keys. Invalid values are dropped; an
 * existing typed value wins. Runs right after migrations.
 */
export function migrateLegacyUiPreferences(): void {
  const legacy: [string, keyof Settings][] = [
    ['ui.appearance', 'appearance'],
    ['ui.proofExpiryDays', 'proofExpiryDays'],
  ];
  const stored = readAll();
  const entries: [string, unknown][] = [];
  for (const [oldKey, key] of legacy) {
    if (!stored.has(appKey(oldKey))) continue;
    entries.push([appKey(oldKey), undefined]);
    if (stored.has(key)) continue;
    const parsed = SettingsSchema.safeParse({ [key]: stored.get(appKey(oldKey)) });
    if (parsed.success) entries.push([key, parsed.data[key]]);
  }
  if (entries.length) write(entries);
}

/** Removes every app-local value (sign-out / delete all data). */
export function clearAppValues(): void {
  db.delete(settings).where(like(settings.key, 'app.%')).run();
  notifyTables('settings');
}
