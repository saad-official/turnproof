import { Stack } from 'expo-router';

import type { HeaderActionsProps } from './header-actions.types';

/** Native bar-button items (Liquid Glass on iOS 26). */
export function HeaderActions({ actions }: HeaderActionsProps) {
  return (
    <Stack.Toolbar placement="right">
      {actions.map((a) => (
        <Stack.Toolbar.Button
          key={a.key}
          icon={a.icon.sf}
          accessibilityLabel={a.label}
          onPress={a.onPress}
          variant={a.prominent ? 'prominent' : 'plain'}
        />
      ))}
    </Stack.Toolbar>
  );
}
