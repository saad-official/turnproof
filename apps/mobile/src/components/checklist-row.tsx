import { Pressable, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { icons } from '@/constants/icons';
import { actionTarget, cssEasing, motion, radius, spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

const BOX = 30;

/**
 * One checklist item as a large toggle (56 pt, the whole row is the target). The check fills and
 * settles in with a short CSS transition; required items are marked in words, not colour alone.
 */
export function ChecklistRow({
  label,
  required,
  checked,
  onToggle,
  disabled,
}: {
  label: string;
  required: boolean;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const duration = reduced ? 0 : motion.duration.fast;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={required ? `${label}, required` : `${label}, optional`}
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => ({
        minHeight: actionTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Animated.View
        style={{
          width: BOX,
          height: BOX,
          borderRadius: radius.pill,
          borderWidth: 2,
          borderColor: checked ? colors.accent : colors.border,
          backgroundColor: checked ? colors.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          transitionProperty: ['backgroundColor', 'borderColor'],
          transitionDuration: duration,
          transitionTimingFunction: cssEasing.out,
        }}
      >
        <Animated.View
          style={{
            opacity: checked ? 1 : 0,
            transform: [{ scale: checked ? 1 : 0.6 }],
            transitionProperty: ['opacity', 'transform'],
            transitionDuration: duration,
            transitionTimingFunction: cssEasing.out,
          }}
        >
          <Icon name={icons.check} size={16} color={colors.onAccent} weight="bold" />
        </Animated.View>
      </Animated.View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body" tone={checked ? 'secondary' : 'primary'}>
          {label}
        </AppText>
        <AppText variant="caption" tone={required ? 'secondary' : 'tertiary'}>
          {required ? 'Required' : 'Optional'}
        </AppText>
      </View>
    </Pressable>
  );
}
