import type { IssueSeverity } from '@turnproof/shared';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ChoiceChips, Field, TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { Icon } from '@/components/icon';
import { PrimaryButton } from '@/components/primary-button';
import { SeverityPicker } from '@/components/severity-picker';
import { showToast } from '@/components/toast';
import { icons } from '@/constants/icons';
import { captureErrorMessage, turnoverFailureMessage } from '@/constants/messages';
import { addIssue } from '@/data';
import { useSettings } from '@/hooks/use-settings';
import { useTurnover } from '@/hooks/use-turnovers';
import { CaptureError, takeProofPhoto, type CaptureResult } from '@/native/capture';
import { haptics } from '@/native/haptics';
import { deletePhotoFile } from '@/native/photo-files';
import { radius, shutterSize, spacing, useTheme } from '@/theme';

const WHOLE = '__whole__';
const PREVIEW_HEIGHT = 260;

/** Inline camera for the issue photo: preview → shutter → still with Retake. */
function IssueCamera({ shot, onShot, onRetake }: { shot: CaptureResult | null; onShot: (s: CaptureResult) => void; onRetake: () => void }) {
  const { colors } = useTheme();
  const { stampGps } = useSettings();
  const [permission, requestPermission] = useCameraPermissions();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const frame = {
    height: PREVIEW_HEIGHT,
    borderRadius: radius.md,
    borderCurve: 'continuous' as const,
    overflow: 'hidden' as const,
    backgroundColor: colors.cameraBackground,
  };

  if (shot) {
    return (
      <View style={{ gap: spacing.xs }}>
        <View style={frame}>
          <Image source={{ uri: shot.localUri }} contentFit="cover" style={{ flex: 1 }} accessibilityLabel="Issue photo" />
        </View>
        <PrimaryButton title="Retake photo" icon={icons.refresh} variant="secondary" onPress={onRetake} />
      </View>
    );
  }

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Take a photo of the issue"
        onPress={async () => {
          if (!permission?.granted) {
            const r = await requestPermission();
            if (!r.granted) {
              if (!r.canAskAgain) Linking.openSettings().catch(() => undefined);
              return;
            }
          }
          setOpen(true);
        }}
        style={({ pressed }) => ({
          minHeight: 120,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: pressed ? colors.border : colors.issueSoft,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
        })}
      >
        <Icon name={icons.addPhoto} size={32} color={colors.issueText} />
        <AppText variant="body" tone="issue" weight="600">
          Take a photo
        </AppText>
        <AppText variant="caption" tone="secondary">
          Stamped like every proof photo
        </AppText>
      </Pressable>
    );
  }

  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    haptics.shutter();
    try {
      onShot(await takeProofPhoto(cameraRef, { stampGps }));
      setOpen(false);
    } catch (e) {
      haptics.error();
      setError(e instanceof CaptureError ? captureErrorMessage(e.code) : 'The photo could not be taken.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={frame}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" animateShutter onCameraReady={() => setReady(true)} />
        <View style={{ position: 'absolute', bottom: spacing.sm, start: 0, end: 0, alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            accessibilityState={{ busy, disabled: !ready }}
            disabled={!ready || busy}
            onPress={shoot}
            style={({ pressed }) => ({
              width: shutterSize - 16,
              height: shutterSize - 16,
              borderRadius: radius.pill,
              borderWidth: 4,
              borderColor: colors.shutter,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: ready ? 1 : 0.5,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}
          >
            {busy ? <ActivityIndicator color={colors.shutter} /> : <View style={{ width: shutterSize - 32, height: shutterSize - 32, borderRadius: radius.pill, backgroundColor: colors.shutter }} />}
          </Pressable>
        </View>
      </View>
      {error ? (
        <AppText variant="caption" tone="issue" selectable>
          {error}
        </AppText>
      ) : null}
      <PrimaryButton title="Cancel photo" variant="ghost" onPress={() => setOpen(false)} />
    </View>
  );
}

/**
 * `issue?turnoverId&roomId`: report damage or a problem with a stamped photo, a severity and a
 * note, for a room or the whole property. Also opened by the `?issue=1` deep link.
 */
export function IssueSheet() {
  const { turnoverId, roomId } = useLocalSearchParams<{ turnoverId: string; roomId?: string }>();
  const turnover = useTurnover(turnoverId);
  const rooms = turnover?.property?.rooms ?? [];
  const [room, setRoom] = useState<string>(roomId && rooms.some((r) => r.id === roomId) ? roomId : WHOLE);
  const [severity, setSeverity] = useState<IssueSeverity>('medium');
  const [note, setNote] = useState('');
  const [shot, setShot] = useState<CaptureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<CaptureResult | null>(null);
  const submitted = useRef(false);

  // A photo taken but never reported is deleted when the sheet closes.
  useEffect(
    () => () => {
      if (!submitted.current && pending.current) deletePhotoFile(pending.current.localUri);
    },
    [],
  );

  const setPhoto = (next: CaptureResult | null) => {
    if (pending.current && pending.current.id !== next?.id) deletePhotoFile(pending.current.localUri);
    pending.current = next;
    setShot(next);
    if (next) setError(null);
  };

  const report = async () => {
    if (!turnover) return;
    if (!note.trim() && !shot) {
      haptics.warning();
      setError('Add a photo or a note.');
      return;
    }
    setBusy(true);
    try {
      const r = await addIssue(turnover.id, { roomId: room === WHOLE ? null : room, severity, note: note.trim(), photo: shot });
      if (!r.ok) {
        haptics.error();
        setError(r.message ?? turnoverFailureMessage(r.reason));
        return;
      }
      submitted.current = true;
      haptics.issue();
      showToast({ message: 'Issue reported' });
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      title="Report an issue"
      footer={<PrimaryButton title="Report issue" icon={icons.issue} variant="issue" size="lg" loading={busy} onPress={report} />}
    >
      <IssueCamera shot={shot} onShot={setPhoto} onRetake={() => setPhoto(null)} />
      {rooms.length > 0 ? (
        <Field label="Where">
          <ChoiceChips
            accessibilityLabel="Where"
            options={[...rooms.map((r) => ({ value: r.id, label: r.name })), { value: WHOLE, label: 'Whole property' }]}
            isSelected={(v) => v === room}
            onToggle={setRoom}
          />
        </Field>
      ) : null}
      <Field label="Severity">
        <SeverityPicker value={severity} onChange={setSeverity} />
      </Field>
      <TextField
        label="Note"
        value={note}
        onChangeText={(v) => {
          setNote(v);
          if (error) setError(null);
        }}
        placeholder="What happened? e.g. Red wine stain on the sofa cushion"
        multiline
        maxLength={1000}
        error={error}
      />
    </FormSheet>
  );
}
