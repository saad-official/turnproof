// UI-only accessibility preferences that Reanimated does not already expose.
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

let reduceTransparency = false;
const listeners = new Set<() => void>();
let started = false;

function start() {
  if (started || process.env.EXPO_OS !== 'ios') return;
  started = true;
  const set = (value: boolean) => {
    if (value === reduceTransparency) return;
    reduceTransparency = value;
    listeners.forEach((l) => l());
  };
  AccessibilityInfo.isReduceTransparencyEnabled()
    .then(set)
    .catch(() => undefined);
  AccessibilityInfo.addEventListener('reduceTransparencyChanged', set);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** iOS "Reduce Transparency": glass and blur give way to solid surfaces. */
export function useReduceTransparency(): boolean {
  return useSyncExternalStore(subscribe, () => reduceTransparency);
}
