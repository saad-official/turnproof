import type { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { supportsLiquidGlass } from '@/components/glass-bar';
import { useTheme } from '@/theme';

type StackOptions = NonNullable<ComponentProps<typeof Stack>['screenOptions']>;
export type ScreenOptions = Exclude<StackOptions, (...args: never[]) => unknown>;

const IOS = process.env.EXPO_OS === 'ios';

/**
 * Native stack options for every tab: iOS large titles that collapse over the scroll-edge material
 * (system Liquid Glass on iOS 26), a flat Material top app bar on Android. Reduced motion → fade.
 */
export function useTabStackOptions(): ScreenOptions {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  return {
    headerLargeTitleEnabled: IOS,
    headerTransparent: IOS,
    headerBlurEffect: IOS && !supportsLiquidGlass ? 'systemChromeMaterial' : undefined,
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerStyle: { backgroundColor: IOS ? 'transparent' : colors.surface },
    headerLargeStyle: { backgroundColor: 'transparent' },
    headerTitleStyle: { color: colors.text },
    headerLargeTitleStyle: { color: colors.text },
    headerTintColor: colors.accentText,
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: colors.surface },
    animation: reduced ? 'fade' : 'default',
  };
}

/** Options for a pushed detail screen (no large title). */
export function useDetailStackOptions(): ScreenOptions {
  const base = useTabStackOptions();
  return { ...base, headerLargeTitleEnabled: false };
}
