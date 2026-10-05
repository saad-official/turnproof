import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import type { IconName } from '@/constants/icons';
import { radius, spacing, useTheme } from '@/theme';

/**
 * Shared shell of the onboarding steps: an icon, a title and the why, then bottom-anchored actions
 * (thumb reach). The system prompt only appears after the user taps the primary action.
 */
export function PrimingLayout({
  icon,
  step,
  title,
  body,
  children,
  actions,
}: {
  icon: IconName;
  step: string;
  title: string;
  body: string;
  children?: ReactNode;
  actions: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.lg, paddingTop: insets.top + spacing.xl, gap: spacing.lg }}
      >
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            backgroundColor: colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={42} color={colors.accentText} />
        </View>
        <View style={{ gap: spacing.sm }}>
          <AppText variant="caption" tone="secondary" weight="600">
            {step}
          </AppText>
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
          <AppText variant="body" tone="secondary">
            {body}
          </AppText>
        </View>
        {children}
      </ScrollView>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.md, paddingTop: spacing.sm, gap: spacing.xs }}>{actions}</View>
    </View>
  );
}
