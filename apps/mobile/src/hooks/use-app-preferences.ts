// UI-only, device-local preferences that the shared `Settings` schema does not carry (appearance,
// default proof-link lifetime). Stored as `app.*` values through the data layer, mirrored in tiny
// stores so every consumer re-renders on change. Hydrated once the database is migrated.
import { DEFAULT_PROOF_DAYS } from '@turnproof/shared';

import { createStore, getAppValue, setAppValue, useStore } from '@/data';

export type AppearancePreference = 'system' | 'light' | 'dark';

export const PROOF_DAY_OPTIONS = [7, 30, 60] as const;
export type ProofDays = (typeof PROOF_DAY_OPTIONS)[number];

const APPEARANCE_KEY = 'ui.appearance';
const PROOF_DAYS_KEY = 'ui.proofExpiryDays';

const appearanceStore = createStore<AppearancePreference>('system');
const proofDaysStore = createStore<ProofDays>(DEFAULT_PROOF_DAYS as ProofDays);
const hydratedStore = createStore(false);

const isAppearance = (v: unknown): v is AppearancePreference => v === 'system' || v === 'light' || v === 'dark';
const isProofDays = (v: unknown): v is ProofDays => PROOF_DAY_OPTIONS.includes(v as ProofDays);

/** Reads the stored preferences (call once, after migrations). */
export function hydrateAppPreferences(): void {
  try {
    const appearance = getAppValue<unknown>(APPEARANCE_KEY, 'system');
    appearanceStore.setState(isAppearance(appearance) ? appearance : 'system');
    const days = getAppValue<unknown>(PROOF_DAYS_KEY, DEFAULT_PROOF_DAYS);
    proofDaysStore.setState(isProofDays(days) ? days : (DEFAULT_PROOF_DAYS as ProofDays));
  } catch {
    // Database not ready: keep the defaults.
  }
  hydratedStore.setState(true);
}

/** True once `hydrateAppPreferences` ran (the root layout keeps the splash up until then). */
export function useAppPreferencesHydrated(): boolean {
  return useStore(hydratedStore);
}

export function useAppearance(): AppearancePreference {
  return useStore(appearanceStore);
}

export function setAppearance(value: AppearancePreference): void {
  appearanceStore.setState(value);
  setAppValue(APPEARANCE_KEY, value);
}

/** Default lifetime of a newly published proof link, in days. */
export function useProofExpiryDays(): ProofDays {
  return useStore(proofDaysStore);
}

export function setProofExpiryDays(value: ProofDays): void {
  proofDaysStore.setState(value);
  setAppValue(PROOF_DAYS_KEY, value);
}

/** Non-hook read for event handlers (publishing). */
export function proofExpiryDays(): ProofDays {
  return proofDaysStore.getSnapshot();
}
