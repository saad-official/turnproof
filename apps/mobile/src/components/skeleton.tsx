import { View, type DimensionValue } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { radius as radii, spacing, useTheme, type RadiusToken } from '@/theme';

const PULSE = {
  from: { opacity: 1 },
  to: { opacity: 0.5 },
};

/** A placeholder block that softly pulses (static with Reduce Motion). */
export function Skeleton({ width = '100%', height = 16, radius = 'sm' }: { width?: DimensionValue; height?: number; radius?: RadiusToken }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  return (
    <Animated.View
      accessible={false}
      style={{
        width,
        height,
        borderRadius: radii[radius],
        borderCurve: 'continuous',
        backgroundColor: colors.surfaceSunken,
        ...(reduced
          ? null
          : {
              animationName: PULSE,
              animationDuration: 900,
              animationIterationCount: 'infinite',
              animationDirection: 'alternate',
              animationTimingFunction: 'ease-in-out',
            }),
      }}
    />
  );
}

/** Rows of skeletons shaped like a list group, for network-backed sections (members). */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={{ backgroundColor: colors.surfaceElevated, borderRadius: radii.md, borderCurve: 'continuous', padding: spacing.md, gap: spacing.lg }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Skeleton width={40} height={40} radius="pill" />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="35%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A row of photo-tile placeholders. */
export function SkeletonTiles({ count = 3, size }: { count?: number; size: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }} accessibilityLabel="Loading photos">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width={size} height={size} radius="md" />
      ))}
    </View>
  );
}
