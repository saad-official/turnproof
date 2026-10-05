import { View } from 'react-native';

import { icons } from '@/constants/icons';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { PrimaryButton } from './primary-button';

/**
 * A property's invite code, large and spaced for reading aloud, with Share and "New code".
 * The code is selectable so it can be copied.
 */
export function ShareCodeCard({
  code,
  onShare,
  onRotate,
  rotating,
}: {
  code: string;
  onShare: () => void;
  onRotate?: () => void;
  rotating?: boolean;
}) {
  const { colors, shadow } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        padding: spacing.lg,
        gap: spacing.md,
        boxShadow: shadow('sm'),
      }}
    >
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="callout" tone="secondary" weight="600">
          Invite code
        </AppText>
        <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: radius.sm, paddingVertical: spacing.md, alignItems: 'center' }}>
          <AppText
            variant="display"
            selectable
            accessibilityLabel={`Invite code ${code.split('').join(' ')}`}
            style={{ letterSpacing: 6, fontVariant: ['tabular-nums'] }}
          >
            {code}
          </AppText>
        </View>
        <AppText variant="caption" tone="secondary">
          Your cleaner enters this in Turnproof under Properties → Join with a code. They see the schedule; their turnovers appear here.
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        <PrimaryButton title="Share code" icon={icons.share} onPress={onShare} style={{ flex: 1 }} />
        {onRotate ? (
          <PrimaryButton title="New code" variant="secondary" icon={icons.refresh} loading={rotating} onPress={onRotate} block={false} />
        ) : null}
      </View>
    </View>
  );
}
