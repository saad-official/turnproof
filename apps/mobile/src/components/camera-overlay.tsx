import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { icons } from '@/constants/icons';
import { useSecondTick } from '@/data';
import { CHROME_FONT_CAP, cssEasing, dotSize, radius, shutterSize, spacing, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';
import { IconButton } from './icon-button';

export type GpsStatus = 'on' | 'off' | 'denied' | 'pending';
export type CameraFlash = 'off' | 'on' | 'auto';

const GPS_TEXT: Record<GpsStatus, string> = {
  on: 'GPS on',
  off: 'GPS off',
  denied: 'No location access',
  pending: 'Locating…',
};

const FLASH_ICON = { off: icons.flashOff, on: icons.flashOn, auto: icons.flashAuto } as const;
const FLASH_LABEL = { off: 'Flash off', on: 'Flash on', auto: 'Flash auto' } as const;

/** The big round shutter: a 4 pt ring around a filled disc that dips on press. */
function Shutter({ onPress, busy, disabled }: { onPress: () => void; busy: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Take photo"
      accessibilityState={{ busy, disabled: !!disabled }}
      disabled={busy || disabled}
      onPress={onPress}
      style={{ width: shutterSize, height: shutterSize, alignItems: 'center', justifyContent: 'center' }}
    >
      {({ pressed }) => (
        <View
          style={{
            width: shutterSize,
            height: shutterSize,
            borderRadius: radius.pill,
            borderWidth: 4,
            borderColor: colors.shutter,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.4 : 1,
          }}
        >
          <Animated.View
            style={{
              width: shutterSize - 16,
              height: shutterSize - 16,
              borderRadius: radius.pill,
              backgroundColor: colors.shutter,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed || busy ? 0.88 : 1 }],
              transitionProperty: 'transform',
              transitionDuration: 120,
              transitionTimingFunction: cssEasing.out,
            }}
          >
            {busy ? <ActivityIndicator color={colors.cameraBackground} /> : null}
          </Animated.View>
        </View>
      )}
    </Pressable>
  );
}

/** Live stamp preview: what will be written on the next photo. */
const stampClock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });

function StampPreview({ gps }: { gps: GpsStatus }) {
  const time = stampClock.format(new Date(useSecondTick()));
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Stamp: ${time}, ${GPS_TEXT[gps]}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        alignSelf: 'center',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xxs + 2,
        borderRadius: radius.pill,
        backgroundColor: colors.photoChip,
      }}
    >
      <AppText variant="callout" tone="onPhoto" tabular weight="600" maxFontSizeMultiplier={CHROME_FONT_CAP}>
        {time}
      </AppText>
      <View
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: radius.pill,
          backgroundColor: gps === 'on' ? colors.verified : 'transparent',
          borderWidth: gps === 'on' ? 0 : 1.5,
          borderColor: colors.onPhotoChip,
        }}
      />
      <AppText variant="caption" tone="onPhoto" maxFontSizeMultiplier={CHROME_FONT_CAP}>
        {GPS_TEXT[gps]}
      </AppText>
    </View>
  );
}

export type CameraOverlayProps = {
  /** "Kitchen". */
  title: string;
  /** "After photos". */
  subtitle: string;

  gps: GpsStatus;
  flash: CameraFlash;
  onCycleFlash: () => void;
  onFlip: () => void;
  onClose: () => void;
  onShutter: () => void;
  busy: boolean;
  ready: boolean;
  /** The thumbnail strip (latest shots). */
  thumbnails?: ReactNode;
  /** Secondary, clearly labelled gallery import. */
  onReference?: () => void;
  photoCount: number;
};

/**
 * Chrome over the full-bleed camera: close + room label + flash/flip on top, the live stamp
 * preview, then the thumbnail strip, a big shutter and Done within thumb reach. Always dark.
 */
export function CameraOverlay({
  title,
  subtitle,

  gps,
  flash,
  onCycleFlash,
  onFlip,
  onClose,
  onShutter,
  busy,
  ready,
  thumbnails,
  onReference,
  photoCount,
}: CameraOverlayProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, justifyContent: 'space-between' }}>
      <View style={{ paddingTop: insets.top + spacing.xs, paddingHorizontal: spacing.md, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <IconButton icon={icons.close} label="Close camera" variant="camera" onPress={onClose} />
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: spacing.xxs,
              paddingHorizontal: spacing.sm,
              borderRadius: radius.pill,
              backgroundColor: colors.cameraControl,
            }}
          >
            <AppText variant="callout" tone="camera" weight="600" numberOfLines={1} maxFontSizeMultiplier={CHROME_FONT_CAP}>
              {title}
            </AppText>
            <AppText variant="caption" tone="cameraSecondary" numberOfLines={1} maxFontSizeMultiplier={CHROME_FONT_CAP}>
              {subtitle}
            </AppText>
          </View>
          <IconButton icon={FLASH_ICON[flash]} label={FLASH_LABEL[flash]} accessibilityHint="Changes the flash mode" variant="camera" onPress={onCycleFlash} />
          <IconButton icon={icons.flip} label="Switch camera" variant="camera" onPress={onFlip} />
        </View>
        <StampPreview gps={gps} />
      </View>

      <View style={{ paddingBottom: insets.bottom + spacing.md, paddingHorizontal: spacing.md, gap: spacing.md }}>
        {thumbnails}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ width: 96, alignItems: 'flex-start' }}>
            {onReference ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add reference photo from your library"
                accessibilityHint="Reference photos are labelled and never count as proof"
                onPress={onReference}
                style={({ pressed }) => ({
                  minHeight: touchTarget,
                  justifyContent: 'center',
                  paddingHorizontal: spacing.xs,
                  borderRadius: radius.sm,
                  backgroundColor: colors.cameraControl,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <AppText variant="caption" tone="camera" weight="600" maxFontSizeMultiplier={1.3} numberOfLines={2}>
                  Add reference photo
                </AppText>
              </Pressable>
            ) : null}
          </View>
          <Shutter onPress={onShutter} busy={busy} disabled={!ready} />
          <View style={{ width: 96, alignItems: 'flex-end' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={photoCount > 0 ? `Done, ${photoCount} photos` : 'Done'}
              onPress={onClose}
              style={({ pressed }) => ({
                minHeight: touchTarget + spacing.xs,
                minWidth: 80,
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: photoCount > 0 ? colors.accent : colors.cameraControl,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <AppText variant="body" weight="700" tone={photoCount > 0 ? 'onAccent' : 'camera'} maxFontSizeMultiplier={1.3}>
                Done
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
