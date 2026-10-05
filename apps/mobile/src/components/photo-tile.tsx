import { stampIsVerified, stampLabel, type PhotoPhase, type Turnover } from '@turnproof/shared';
import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import Animated, { Keyframe, ReduceMotion, useReducedMotion } from 'react-native-reanimated';

import { icons } from '@/constants/icons';
import { deviceTimeZone, formatClock, type LocalPhoto } from '@/data';
import { CHROME_FONT_CAP, dotSize, radius, spacing, tileSize, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

const PHASE_LABEL: Record<PhotoPhase, string> = {
  before: 'Before',
  after: 'After',
  issue: 'Issue',
  reference: 'Reference',
};

/** A photo landing in its row: a quick settle from 92% (rare: once per capture). */
const TILE_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.92 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
})
  .duration(260)
  .reduceMotion(ReduceMotion.System);

/** Time · GPS dot, drawn on the photo. */
export function StampChip({ takenAt, hasGps, compact }: { takenAt: string; hasGps: boolean; compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        paddingHorizontal: compact ? 6 : spacing.xs,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.photoChip,
      }}
    >
      <AppText variant="caption" tone="onPhoto" tabular maxFontSizeMultiplier={CHROME_FONT_CAP} numberOfLines={1}>
        {formatClock(takenAt)}
      </AppText>
      <View
        style={{
          width: dotSize - 3,
          height: dotSize - 3,
          borderRadius: radius.pill,
          backgroundColor: hasGps ? colors.verified : 'transparent',
          borderWidth: hasGps ? 0 : 1.5,
          borderColor: colors.onPhotoChip,
        }}
      />
    </View>
  );
}

export type PhotoTileProps = {
  photo: LocalPhoto;
  /** Needed for the verified-capture check (time window). */
  turnover?: Turnover | null;
  stampGps: boolean;
  size?: number;
  onPress?: () => void;
  /** Captured while this screen is open: animate it in. */
  isNew?: boolean;
};

/**
 * A rounded photo with its stamp chip (time, GPS dot) and a teal verified dot. Reference imports
 * carry a "Reference" chip instead and never the verified dot. Announces phase and stamp.
 */
export function PhotoTile({ photo, turnover, stampGps, size = tileSize, onPress, isNew }: PhotoTileProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const uri = photo.localUri ?? photo.remoteUrl ?? null;
  const reference = photo.phase === 'reference' || photo.stamp.source !== 'camera';
  const verified = !reference && !!turnover && stampIsVerified(photo.stamp, turnover, { stampGps }).verified;
  const hasGps = photo.stamp.lat != null && photo.stamp.lng != null;
  const label = [
    `${PHASE_LABEL[photo.phase]} photo`,
    stampLabel(photo.stamp, deviceTimeZone()),
    reference ? 'reference, not proof' : verified ? 'verified capture' : 'not verified',
  ].join(', ');

  return (
    <Animated.View entering={isNew && !reduced ? TILE_ENTER : undefined}>
      <Pressable
        accessibilityRole={onPress ? 'imagebutton' : 'image'}
        accessibilityLabel={label}
        accessibilityHint={onPress ? 'Opens the photo and its stamp' : undefined}
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: colors.surfaceSunken,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {uri ? (
          <Image
            source={{ uri }}
            recyclingKey={photo.id}
            contentFit="cover"
            transition={reduced ? 0 : 120}
            style={{ width: size, height: size }}
            accessible={false}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icons.photo} size={28} color={colors.textTertiary} />
          </View>
        )}
        {reference ? (
          <View style={{ position: 'absolute', top: spacing.xxs, start: spacing.xxs }}>
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.photoChip }}>
              <AppText variant="caption" tone="onPhoto" maxFontSizeMultiplier={CHROME_FONT_CAP}>
                Reference
              </AppText>
            </View>
          </View>
        ) : verified ? (
          <View
            style={{
              position: 'absolute',
              top: spacing.xxs,
              end: spacing.xxs,
              width: 22,
              height: 22,
              borderRadius: radius.pill,
              backgroundColor: colors.verified,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={icons.verified} size={13} color={colors.onVerified} weight="bold" />
          </View>
        ) : null}
        <View style={{ position: 'absolute', bottom: spacing.xxs, start: spacing.xxs, end: spacing.xxs, flexDirection: 'row' }}>
          <StampChip takenAt={photo.stamp.takenAt} hasGps={hasGps} compact={size < 90} />
        </View>
      </Pressable>
    </Animated.View>
  );
}
