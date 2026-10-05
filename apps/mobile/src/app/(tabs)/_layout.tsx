import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { icons } from '@/constants/icons';
import { useTheme } from '@/theme';

const ANDROID = process.env.EXPO_OS === 'android';

/** The platform tab bar: Liquid Glass on iOS 26, the Material 3 navigation bar on Android. */
export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  const tint = isDark ? colors.accent : colors.accentText;
  return (
    <NativeTabs
      tintColor={tint}
      minimizeBehavior="onScrollDown"
      backgroundColor={ANDROID ? colors.surfaceElevated : undefined}
      indicatorColor={ANDROID ? colors.accentSoft : undefined}
      iconColor={ANDROID ? { default: colors.textSecondary, selected: colors.accentText } : undefined}
      labelStyle={ANDROID ? { default: { color: colors.textSecondary }, selected: { color: colors.text } } : undefined}
    >
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Icon sf={icons.today.sf} md={icons.today.md} />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="properties">
        <NativeTabs.Trigger.Icon sf={icons.properties.sf} md={icons.properties.md} />
        <NativeTabs.Trigger.Label>Properties</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Icon sf={icons.history.sf} md={icons.history.md} />
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={icons.settings.sf} md={icons.settings.md} />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
