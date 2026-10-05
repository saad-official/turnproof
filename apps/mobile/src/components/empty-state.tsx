import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { IconName } from '@/constants/icons';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
};

/** A calm, centred explanation with one next step. */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl, paddingHorizontal: spacing.md }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={34} color={colors.accentText} />
      </View>
      <View style={{ gap: spacing.xs, alignItems: 'center' }}>
        <AppText variant="headline" align="center" accessibilityRole="header">
          {title}
        </AppText>
        {body ? (
          <AppText variant="body" tone="secondary" align="center" style={{ maxWidth: 420 }}>
            {body}
          </AppText>
        ) : null}
      </View>
      {action ? <View style={{ alignSelf: 'stretch', alignItems: 'center', paddingTop: spacing.sm }}>{action}</View> : null}
    </View>
  );
}
