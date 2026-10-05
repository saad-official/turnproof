import { Stack } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme';

export const unstable_settings = { initialRouteName: 'welcome' };

export default function OnboardingLayout() {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface }, animation: reduced ? 'fade' : 'default' }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="role" />
      <Stack.Screen name="camera" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
