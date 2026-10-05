import { useState } from 'react';
import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import type { IconName } from '@/constants/icons';
import { actionTarget, CHROME_FONT_CAP, cssEasing, radius, spacing, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'issue' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type PrimaryButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** `lg` = 56 pt turnover actions; `md` = 48 pt; `sm` = 44 pt inline (Start on a row). */
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container width (default true). */
  block?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

const HEIGHT: Record<ButtonSize, number> = { sm: touchTarget, md: Math.max(touchTarget, 48), lg: actionTarget };

/** The app's button: pressed feedback is a 3% scale in 120 ms (feedback on press-in). */
export function PrimaryButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  block = true,
  accessibilityLabel,
  accessibilityHint,
  style,
}: PrimaryButtonProps) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  const inactive = !!disabled || !!loading;

  const fill = {
    primary: { bg: colors.accent, fg: colors.onAccent },
    secondary: { bg: colors.accentSoft, fg: colors.accentText },
    ghost: { bg: 'transparent', fg: colors.accentText },
    issue: { bg: colors.issue, fg: colors.onIssue },
    destructive: { bg: colors.issueSoft, fg: colors.issueText },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={16}
      style={[block ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }, style]}
    >
      <Animated.View
        style={{
          minHeight: HEIGHT[size],
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
          paddingVertical: spacing.xs,
          borderRadius: size === 'lg' ? radius.md : radius.sm,
          borderCurve: 'continuous',
          backgroundColor: fill.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed && !inactive ? 0.97 : 1 }],
          transitionProperty: 'transform',
          transitionDuration: 120,
          transitionTimingFunction: cssEasing.out,
        }}
      >
        {loading ? (
          <ActivityIndicator color={fill.fg} />
        ) : (
          <>
            {icon ? <Icon name={icon} size={size === 'lg' ? 22 : 18} color={fill.fg} weight="semibold" /> : null}
            <AppText
              variant={size === 'lg' ? 'body' : 'callout'}
              weight="600"
              maxFontSizeMultiplier={CHROME_FONT_CAP}
              style={{ color: fill.fg, flexShrink: 1 }}
              numberOfLines={2}
              align="center"
            >
              {title}
            </AppText>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}
