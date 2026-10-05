import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import Animated, {
  Keyframe,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CameraOverlay, type CameraFlash, type GpsStatus } from '@/components/camera-overlay';
import { Icon } from '@/components/icon';
import { PrimaryButton } from '@/components/primary-button';
import { icons } from '@/constants/icons';
import { captureErrorMessage, turnoverFailureMessage } from '@/constants/messages';
import { capturePhoto, type LocalPhoto } from '@/data';
import { useLocationPermission } from '@/hooks/use-permissions';
import { usePhotos } from '@/hooks/use-photos';
import { useSettings } from '@/hooks/use-settings';
import { useTurnover } from '@/hooks/use-turnovers';
import { CaptureError, importReferencePhoto, takeProofPhoto } from '@/native/capture';
import { haptics } from '@/native/haptics';
import { easing, radius, spacing, thumbSize, useTheme } from '@/theme';

type Phase = 'before' | 'after';

const NEXT_FLASH: Record<CameraFlash, CameraFlash> = { off: 'auto', auto: 'on', on: 'off' };

/** A fresh shot drops into the strip from the shutter: up 48 pt, from 60% (once per capture). */
const THUMB_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 48 }, { scale: 0.6 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
})
  .duration(280)
  .reduceMotion(ReduceMotion.System);


function Thumbs({ photos, since }: { photos: LocalPhoto[]; since: number }) {
  const { colors } = useTheme();
  if (photos.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }} style={{ flexGrow: 0 }}>
      {[...photos].reverse().map((p) => (
        <Animated.View
          key={p.id}
          entering={Date.parse(p.createdAt) > since ? THUMB_ENTER : undefined}
          style={{
            width: thumbSize,
            height: thumbSize,
            borderRadius: radius.sm,
            borderCurve: 'continuous',
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: colors.shutter,
            backgroundColor: colors.cameraControl,
          }}
        >
          <Image
            source={{ uri: p.localUri ?? p.remoteUrl ?? undefined }}
            recyclingKey={p.id}
            contentFit="cover"
            style={{ flex: 1 }}
            accessibilityLabel={p.phase === 'reference' ? 'Reference photo' : `${p.phase} photo`}
          />
        </Animated.View>
      ))}
    </ScrollView>
  );
}

function PermissionGate({ canAskAgain, onAsk }: { canAskAgain: boolean; onAsk: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.cameraBackground,
        padding: spacing.lg,
        paddingTop: insets.top + spacing.xl,
        paddingBottom: insets.bottom + spacing.md,
        justifyContent: 'space-between',
      }}
    >
      <StatusBar style="light" />
      <View style={{ gap: spacing.md, flex: 1, justifyContent: 'center' }}>
        <Icon name={icons.camera} size={44} color={colors.cameraText} />
        <AppText variant="title" tone="camera" accessibilityRole="header">
          Camera access needed
        </AppText>
        <AppText variant="body" tone="cameraSecondary">
          Proof photos are taken in Turnproof so each one can be stamped with the time, place and a fingerprint of the file.
          {canAskAgain ? '' : ' Turn on camera access for Turnproof in Settings.'}
        </AppText>
      </View>
      <View style={{ gap: spacing.xs }}>
        <PrimaryButton title={canAskAgain ? 'Allow camera' : 'Open Settings'} size="lg" onPress={canAskAgain ? onAsk : () => Linking.openSettings()} />
        <PrimaryButton title="Not now" variant="ghost" onPress={() => router.back()} />
      </View>
    </View>
  );
}

/**
 * `capture?turnoverId&roomId&phase`: full-bleed camera with the live stamp preview, a big shutter,
 * flash and flip, and Done back to the room. Each shot goes through `takeProofPhoto` (resize,
 * EXIF strip, sha256, GPS fix) → `capturePhoto`, and drops into the thumbnail strip.
 * A clearly labelled secondary action imports a *reference* photo from the library.
 */
export function CaptureScreen() {
  const { turnoverId, roomId, phase: rawPhase } = useLocalSearchParams<{ turnoverId: string; roomId: string; phase: string }>();
  const phase: Phase = rawPhase === 'after' ? 'after' : 'before';
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const turnover = useTurnover(turnoverId);
  const room = turnover?.property?.rooms.find((r) => r.id === roomId);
  const photos = usePhotos(turnoverId, roomId);
  const shots = photos.filter((p) => p.phase === phase || p.phase === 'reference');
  const proofCount = photos.filter((p) => p.phase === phase).length;
  const { stampGps } = useSettings();
  const [location] = useLocationPermission();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<CameraFlash>('off');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const flashOpacity = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.get() }));

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(timer);
  }, [error]);

  // The turnover stopped running (finished elsewhere, abandoned): nothing to capture for.
  useEffect(() => {
    if (turnover && turnover.status !== 'in-progress') router.back();
  }, [turnover]);

  if (!permission) return <View style={{ flex: 1, backgroundColor: colors.cameraBackground }} />;
  if (!permission.granted) return <PermissionGate canAskAgain={permission.canAskAgain} onAsk={() => void requestPermission()} />;

  const gps: GpsStatus = !stampGps ? 'off' : location === null ? 'pending' : location.status === 'granted' ? 'on' : 'denied';

  const shoot = async () => {
    if (busy || !ready || !turnover) return;
    setBusy(true);
    setError(null);
    haptics.shutter();
    flashOpacity.set(
      withSequence(withTiming(reduced ? 0.3 : 0.85, { duration: 40 }), withTiming(0, { duration: reduced ? 120 : 240, easing: easing.out })),
    );
    try {
      const shot = await takeProofPhoto(cameraRef, { stampGps });
      const r = await capturePhoto(turnover.id, roomId, phase, shot);
      if (!r.ok) {
        haptics.error();
        setError(r.message ?? turnoverFailureMessage(r.reason));
      }
    } catch (e) {
      haptics.error();
      setError(e instanceof CaptureError ? captureErrorMessage(e.code) : 'The photo could not be taken.');
    } finally {
      setBusy(false);
    }
  };

  const addReference = async () => {
    if (!turnover) return;
    try {
      const shot = await importReferencePhoto();
      if (!shot) return;
      const r = await capturePhoto(turnover.id, roomId, 'reference', shot);
      if (!r.ok) setError(r.message ?? turnoverFailureMessage(r.reason));
      else haptics.selection();
    } catch (e) {
      setError(e instanceof CaptureError ? captureErrorMessage(e.code) : 'The photo could not be imported.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.cameraBackground }}>
      <StatusBar style="light" />
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing={facing}
        flash={flash}
        animateShutter={false}
        onCameraReady={() => setReady(true)}
        onMountError={(e) => setError(e.message)}
        accessibilityLabel="Camera preview"
      />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: colors.flash }, flashStyle]} />
      <CameraOverlay
        title={room?.name ?? 'Room'}
        subtitle={`${phase === 'before' ? 'Before' : 'After'} photos${proofCount ? ` · ${proofCount} taken` : ''}`}
        gps={gps}
        flash={flash}
        onCycleFlash={() => {
          haptics.selection();
          setFlash((f) => NEXT_FLASH[f]);
        }}
        onFlip={() => {
          haptics.selection();
          setReady(false);
          setFacing((f) => (f === 'back' ? 'front' : 'back'));
        }}
        onClose={() => router.back()}
        onShutter={shoot}
        busy={busy}
        ready={ready}
        photoCount={proofCount}
        onReference={addReference}
        thumbnails={
          <View style={{ gap: spacing.xs }}>
            {error ? (
              <View
                accessibilityLiveRegion="assertive"
                style={{ alignSelf: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill, backgroundColor: colors.issue }}
              >
                <AppText variant="callout" tone="onIssue" weight="600" selectable>
                  {error}
                </AppText>
              </View>
            ) : null}
            <Thumbs photos={shots} since={openedAt} />
          </View>
        }
      />
    </View>
  );
}
