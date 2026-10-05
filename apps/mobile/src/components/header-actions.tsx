import { Stack } from 'expo-router';
import { View } from 'react-native';

import { spacing } from '@/theme';

import type { HeaderActionsProps } from './header-actions.types';
import { IconButton } from './icon-button';

/** Material top-app-bar action icons. */
export function HeaderActions({ actions }: HeaderActionsProps) {
  return (
    <Stack.Screen
      options={{
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: spacing.xxs }}>
            {actions.map((a) => (
              <IconButton key={a.key} icon={a.icon} label={a.label} onPress={a.onPress} />
            ))}
          </View>
        ),
      }}
    />
  );
}
