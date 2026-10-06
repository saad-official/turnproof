import type { ReactNode } from 'react';
import { View } from 'react-native';

import { spacing } from '@/theme';

import { AppText } from './app-text';

/** A section title above a group, with an optional detail and trailing action. */
export function SectionHeader({
  title,
  detail,
  trailing,
  inset = true,
}: {
  title: string;
  detail?: string;
  trailing?: ReactNode;
  inset?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: spacing.sm,
        paddingHorizontal: inset ? spacing.md : 0,
        marginBottom: -spacing.sm,
      }}
    >
      <View style={{ flexShrink: 1, gap: 2 }}>
        <AppText variant="callout" tone="secondary" weight="600" accessibilityRole="header">
          {title}
        </AppText>
        {detail ? (
          <AppText variant="caption" tone="secondary">
            {detail}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}
