import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useReduceTransparency } from '@/hooks/use-accessibility';
import { cssEasing, motion, radius, spacing, useTheme } from '@/theme';

import { AppText } from './app-text';

const CAN_GLASS = process.env.EXPO_OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/** Whether the platform renders real Liquid Glass (used to avoid glass-on-glass). */
export const supportsLiquidGlass = CAN_GLASS;

/**
 * A horizontal progress track. The fill is absolutely positioned and childless, so animating its
 * width never re-lays-out siblings; it keeps its rounded ends (a `scaleX` would smear them).
 */
export function ProgressTrack({
  progress,
  height = 6,
  accessibilityLabel,
}: {
  progress: number;
  height?: number;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ height, borderRadius: radius.pill, backgroundColor: colors.track, overflow: 'hidden' }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          start: 0,
          width: `${pct}%`,
          borderRadius: radius.pill,
          backgroundColor: colors.accent,
          transitionProperty: 'width',
          transitionDuration: reduced ? 0 : motion.duration.slow,
          transitionTimingFunction: cssEasing.out,
        }}
      />
    </View>
  );
}

export type GlassBarProps = {
  title: string;
  subtitle?: string;
  /** 0 … 1. */
  progress: number;
  /** e.g. the running timer. */
  trailing?: ReactNode;
  /** Actions under the track. */
  children?: ReactNode;
  progressLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The floating turnover progress bar: Liquid Glass on iOS 26, a system material blur on older iOS,
 * a solid elevated surface on Android or with Reduce Transparency. Reserved for the running
 * turnover; never nested, never opacity-animated.
 */
export function GlassBar({ title, subtitle, progress, trailing, children, progressLabel, style }: GlassBarProps) {
  const { colors, shadow, isDark } = useTheme();
  const reduce = useReduceTransparency();
  const shape: ViewStyle = { borderRadius: radius.lg, borderCurve: 'continuous' };
  const body = (
    <View style={{ padding: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="headline" numberOfLines={2}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="callout" tone="secondary" numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {trailing}
      </View>
      <ProgressTrack progress={progress} height={8} accessibilityLabel={progressLabel} />
      {children}
    </View>
  );

  if (CAN_GLASS && !reduce) {
    return (
      <GlassView glassEffectStyle="regular" tintColor={colors.accentSoft} style={[shape, style]}>
        {body}
      </GlassView>
    );
  }
  if (process.env.EXPO_OS === 'ios' && !reduce) {
    return (
      <View style={[shape, { boxShadow: shadow('md') }, style]}>
        <BlurView tint={isDark ? 'systemThickMaterialDark' : 'systemThickMaterialLight'} intensity={90} style={[shape, { overflow: 'hidden' }]}>
          <View style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: colors.accentSoft, opacity: 0.5 }} />
          {body}
        </BlurView>
      </View>
    );
  }
  return <View style={[shape, { backgroundColor: colors.surfaceElevated, boxShadow: shadow('md') }, style]}>{body}</View>;
}
