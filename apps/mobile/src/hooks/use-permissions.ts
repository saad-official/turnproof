// Permission state for Settings and the priming screens, re-read whenever the app returns to the
// foreground (the user may have changed it in the system settings).
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getLocationPermission, type LocationPermission } from '@/native/capture';
import { getNotificationPermission, type NotificationPermission } from '@/native/notifications';

function useForegroundValue<T>(read: () => Promise<T>): [T | null, () => void] {
  const [value, setValue] = useState<T | null>(null);
  const refresh = useCallback(() => {
    read()
      .then(setValue)
      .catch(() => undefined);
  }, [read]);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  return [value, refresh];
}

/** Notification permission (`null` while the first read is pending) and a re-read function. */
export function useNotificationPermission(): [NotificationPermission | null, () => void] {
  return useForegroundValue(getNotificationPermission);
}

/** When-in-use location permission for photo stamps (`null` while pending). */
export function useLocationPermission(): [LocationPermission | null, () => void] {
  return useForegroundValue(getLocationPermission);
}
