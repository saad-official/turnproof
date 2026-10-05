import { Stack } from 'expo-router';

import { ErrorView } from '@/components/error-view';
import { useTabStackOptions } from '@/hooks/use-stack-options';

export const ErrorBoundary = ErrorView;

export default function HistoryStack() {
  const options = useTabStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'History' }} />
      <Stack.Screen name="[id]" options={{ title: 'Summary', headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
