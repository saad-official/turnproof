import { View } from 'react-native';

import { icons } from '@/constants/icons';
import { formatClock } from '@/data';
import { spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/**
 * "11:00 AM · in 1 h 20 min" for a scheduled turnover, coral once overdue. The countdown text comes
 * from the data layer (shared `countdownLabel`), re-evaluated on its 30 s tick.
 */
export function CountdownLabel({
  scheduledFor,
  countdown,
  overdue,
  showTime = true,
}: {
  scheduledFor: string;
  countdown: string | null;
  overdue: boolean;
  showTime?: boolean;
}) {
  const { colors } = useTheme();
  const time = formatClock(scheduledFor);
  const parts = [showTime ? `Checkout ${time}` : null, countdown].filter(Boolean).join(' · ');
  return (
    <View
      accessible
      accessibilityLabel={[showTime ? `Checkout at ${time}` : null, countdown].filter(Boolean).join(', ')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }}
    >
      <Icon name={icons.clock} size={14} color={overdue ? colors.issueText : colors.textSecondary} />
      <AppText variant="callout" tone={overdue ? 'issue' : 'secondary'} weight={overdue ? '600' : undefined} tabular>
        {parts}
      </AppText>
    </View>
  );
}
