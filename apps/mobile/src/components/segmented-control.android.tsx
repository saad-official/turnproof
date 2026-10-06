import { Host, SegmentedButton, SingleChoiceSegmentedButtonRow, Text } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { haptics } from '@/native/haptics';
import { useTheme } from '@/theme';

import type { SegmentedControlProps } from './segmented-control';

/**
 * Android: Material 3 segmented buttons with every state colour taken from the theme. The community
 * wrapper only accepts a tint, so unselected outlines and labels fall back to the wallpaper's
 * Material You palette (pale outlines on dark surfaces, lavender text); seeding the host and passing
 * explicit button colours keeps the control on the brand palette in both schemes.
 */
export function SegmentedControl<T extends string | number>({ options, value, onChange, accessibilityLabel, style }: SegmentedControlProps<T>) {
  const { colors, scheme } = useTheme();
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const buttonColors = {
    activeContainerColor: colors.accent,
    activeContentColor: colors.onAccent,
    activeBorderColor: colors.border,
    inactiveContentColor: colors.text,
    inactiveBorderColor: colors.border,
  };
  return (
    <View accessibilityLabel={accessibilityLabel} style={style}>
      <Host matchContents={{ vertical: true }} seedColor={colors.accent} colorScheme={scheme}>
        <SingleChoiceSegmentedButtonRow>
          {options.map((o, i) => (
            <SegmentedButton
              key={String(o.value)}
              selected={i === index}
              colors={buttonColors}
              onClick={() => {
                if (o.value === value) return;
                haptics.selection();
                onChange(o.value);
              }}
            >
              <SegmentedButton.Label>
                <Text>{o.label}</Text>
              </SegmentedButton.Label>
            </SegmentedButton>
          ))}
        </SingleChoiceSegmentedButtonRow>
      </Host>
    </View>
  );
}
