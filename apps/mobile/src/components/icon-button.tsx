import { useState } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import type { IconName } from '@/constants/icons';
import { cssEasing, radius, touchTarget, useTheme } from '@/theme';

import { Icon } from './icon';

export type IconButtonVariant = 'plain' | 'tinted' | 'filled' | 'issue' | 'camera';

export type IconButtonProps = {
  icon: IconName;
  /** Required: icon-only controls must name themselves. */
  label: string;
  onPress?: () => void;
  variant?: IconButtonVariant;
  size?: number;
  disabled?: boolean;
  selected?: boolean;
  directional?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/** Round icon control with a 44/48 pt target and a 6% press scale. */
export function IconButton({
  icon,
  label,
  onPress,
  variant = 'plain',
  size = touchTarget,
  disabled,
  selected,
  directional,
  accessibilityHint,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  const look = {
    plain: { bg: 'transparent', fg: colors.accentText },
    tinted: { bg: colors.accentSoft, fg: colors.accentText },
    filled: { bg: colors.accent, fg: colors.onAccent },
    issue: { bg: colors.issueSoft, fg: colors.issueText },
    camera: { bg: colors.cameraControl, fg: colors.cameraText },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={Math.max(0, (touchTarget - size) / 2)}
      style={style}
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: radius.pill,
          backgroundColor: look.bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
          transitionProperty: 'transform',
          transitionDuration: 120,
          transitionTimingFunction: cssEasing.out,
        }}
      >
        <Icon name={icon} size={Math.round(size * 0.46)} color={look.fg} weight="semibold" directional={directional} />
      </Animated.View>
    </Pressable>
  );
}
