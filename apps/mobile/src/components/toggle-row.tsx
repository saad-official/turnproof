import { Host, Switch } from '@expo/ui';
import { View } from 'react-native';

import type { IconName } from '@/constants/icons';
import { spacing, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/**
 * A grouped-list row with a native switch (`@expo/ui` Switch: SwiftUI Toggle / Material 3 Switch).
 * The whole row is one accessible switch.
 */
export function ToggleRow({
  title,
  subtitle,
  icon,
  value,
  onValueChange,
  disabled,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { colors, scheme } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => !disabled && onValueChange(!value)}
      style={{
        minHeight: touchTarget + spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      {icon ? <Icon name={icon} size={22} color={colors.accentText} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body">{title}</AppText>
        {subtitle ? (
          <AppText variant="callout" tone="secondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Host matchContents colorScheme={scheme} seedColor={colors.accent}>
        <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
      </Host>
    </View>
  );
}
