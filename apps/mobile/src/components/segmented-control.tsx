import NativeSegmentedControl from '@expo/ui/community/segmented-control';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/native/haptics';
import { useTheme } from '@/theme';

export type SegmentedControlProps<T extends string | number> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Native segmented control (`@expo/ui`: SwiftUI segmented Picker on iOS, Material 3 segmented
 * buttons on Android). Max ~4 short options.
 */
export function SegmentedControl<T extends string | number>({ options, value, onChange, accessibilityLabel, style }: SegmentedControlProps<T>) {
  const { colors, scheme } = useTheme();
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <View accessibilityLabel={accessibilityLabel} style={style}>
      <NativeSegmentedControl
        values={options.map((o) => o.label)}
        selectedIndex={index}
        tintColor={colors.accent}
        appearance={scheme}
        onChange={({ nativeEvent }) => {
          const next = options[nativeEvent.selectedSegmentIndex];
          if (!next || next.value === value) return;
          haptics.selection();
          onChange(next.value);
        }}
      />
    </View>
  );
}
