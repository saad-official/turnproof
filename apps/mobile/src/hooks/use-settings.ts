import { DEFAULT_SETTINGS, type Settings } from '@turnproof/shared';

import { getSettings } from '@/data/settings-repo';
import { useLiveQuery } from '@/data/store';

/**
 * Current settings (shared `SettingsSchema`: `onboarded`, `role`, `reminderLeadMinutes`,
 * `stampGps`, `displayName?`, `appearance`, `proofExpiryDays`), defaults applied (`DEFAULT_SETTINGS` until the database is ready).
 * Write with `updateSettings(patch)` from `@/data`.
 */
export function useSettings(): Settings {
  return useLiveQuery('settings', ['settings'], getSettings, DEFAULT_SETTINGS);
}
