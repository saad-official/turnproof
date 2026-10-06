import type { ErrorBoundaryProps } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { icons } from '@/constants/icons';
import { spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { EmptyState } from './empty-state';
import { PrimaryButton } from './primary-button';

/** Per-tab error boundary: the rest of the app keeps working, and the tab can retry. */
export function ErrorView({ error, retry }: ErrorBoundaryProps) {
  const { colors } = useTheme();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'center' }}
    >
      <EmptyState
        icon={icons.issue}
        title="This screen hit a problem"
        body="Your turnovers and photos are safe on this phone. Try again; if it keeps happening, contact support with the message below."
        action={<PrimaryButton title="Try again" onPress={retry} block={false} />}
      />
      <View style={{ paddingHorizontal: spacing.md }}>
        <AppText variant="caption" tone="secondary" selectable align="center">
          {error.message}
        </AppText>
      </View>
    </ScrollView>
  );
}
