import type { ReactNode, Ref } from 'react';
import { ScrollView, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';

import { spacing, useTheme } from '@/theme';

export type ScreenProps = Omit<ScrollViewProps, 'contentContainerStyle'> & {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  ref?: Ref<ScrollView>;
};

/**
 * Scrollable screen body. The ScrollView is the first child of the route so the native header
 * (large-title collapse) and tab-bar insets work; safe areas come from
 * `contentInsetAdjustmentBehavior`, never hand-made margins.
 */
export function Screen({ children, contentStyle, style, ref, ...props }: ScreenProps) {
  const { colors } = useTheme();
  return (
    <ScrollView
      ref={ref}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={[{ flex: 1, backgroundColor: colors.surface }, style]}
      contentContainerStyle={[
        { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.lg },
        contentStyle,
      ]}
      {...props}
    >
      {children}
    </ScrollView>
  );
}
