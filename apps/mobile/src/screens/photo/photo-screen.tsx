import { STAMP_REASON_TEXT, stampIsVerified, stampLabel } from '@turnproof/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { FormSheet } from '@/components/form-sheet';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { StatePill } from '@/components/state-pill';
import { icons } from '@/constants/icons';
import { turnoverFailureMessage } from '@/constants/messages';
import { deletePhoto, deviceTimeZone, type LocalPhoto } from '@/data';
import { usePhoto } from '@/hooks/use-photos';
import { useSettings } from '@/hooks/use-settings';
import { useTurnover } from '@/hooks/use-turnovers';
import { haptics } from '@/native/haptics';
import { radius, spacing, useTheme } from '@/theme';

const PHASE: Record<LocalPhoto['phase'], string> = { before: 'Before photo', after: 'After photo', issue: 'Issue photo', reference: 'Reference photo' };

const UPLOAD: Record<LocalPhoto['uploadState'], string> = {
  local: 'On this phone, waiting to upload',
  uploading: 'Uploading…',
  uploaded: 'Uploaded',
  failed: 'Upload failed, will retry',
};

/** `photo/[id]?turnoverId`: the photo with its full stamp, verification and (while running) Retake. */
export function PhotoScreen() {
  const { id, turnoverId } = useLocalSearchParams<{ id: string; turnoverId: string }>();
  const photo = usePhoto(id);
  const turnover = useTurnover(photo?.turnoverId ?? turnoverId);
  const { stampGps } = useSettings();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!photo) {
    return (
      <FormSheet title="Photo" leadingLabel="Done">
        <EmptyState icon={icons.photo} title="Photo removed" body="This photo was deleted or retaken." />
      </FormSheet>
    );
  }

  const reference = photo.phase === 'reference' || photo.stamp.source !== 'camera';
  const check = turnover ? stampIsVerified(photo.stamp, turnover, { stampGps }) : null;
  const uri = photo.localUri ?? photo.remoteUrl ?? undefined;
  const aspect = photo.height > 0 ? photo.width / photo.height : 1;
  const imageWidth = width - spacing.md * 2;
  const canDelete = turnover?.status === 'in-progress' || reference;
  const s = photo.stamp;

  const confirmDelete = () => {
    haptics.warning();
    Alert.alert(reference ? 'Remove this reference photo?' : 'Delete and retake?', 'The photo file is deleted from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await deletePhoto(photo.id);
            if (!r.ok) {
              setError(turnoverFailureMessage(r.reason));
              return;
            }
            router.back();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <FormSheet title={PHASE[photo.phase]} leadingLabel="Done">
      <View
        style={{
          width: imageWidth,
          height: Math.min(imageWidth / aspect, imageWidth * 1.4),
          borderRadius: radius.md,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: colors.surfaceSunken,
        }}
      >
        {uri ? <Image source={{ uri }} contentFit="contain" style={{ flex: 1 }} accessibilityLabel={PHASE[photo.phase]} /> : null}
      </View>

      <View style={{ gap: spacing.xs }}>
        {reference ? <StatePill kind="reference" /> : check?.verified ? <StatePill kind="verified" /> : <StatePill kind="proof-none" label="Not verified" />}
        {check && check.reasons.length > 0 && !reference ? (
          <AppText variant="callout" tone="secondary">
            {check.reasons.map((r) => STAMP_REASON_TEXT[r]).join('. ')}
          </AppText>
        ) : null}
        {check && check.notes.length > 0 && !reference ? (
          <AppText variant="caption" tone="tertiary">
            {check.notes.map((n) => STAMP_REASON_TEXT[n]).join('. ')}
          </AppText>
        ) : null}
      </View>

      <ListGroup footer="The fingerprint is a SHA-256 of the exact file that is uploaded; the proof page checks it.">
        <ListRow icon={icons.clock} title="Taken" subtitle={stampLabel(s, deviceTimeZone())} selectable />
        <ListRow
          icon={s.lat != null ? icons.location : icons.locationOff}
          title="Location"
          subtitle={s.lat != null && s.lng != null ? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}${s.accuracyM != null ? ` (±${Math.round(s.accuracyM)} m)` : ''}` : 'Not recorded'}
          selectable
        />
        <ListRow icon={icons.camera} title="Device" subtitle={s.deviceModel} selectable />
        <ListRow icon={icons.shield} title="Fingerprint" subtitle={s.sha256} selectable />
        <ListRow icon={photo.uploadState === 'failed' ? icons.uploadOff : icons.upload} title="Upload" subtitle={UPLOAD[photo.uploadState]} />
      </ListGroup>

      {error ? (
        <AppText variant="callout" tone="issue" selectable>
          {error}
        </AppText>
      ) : null}
      {canDelete ? (
        <PrimaryButton
          title={reference ? 'Remove reference photo' : 'Delete and retake'}
          icon={icons.trash}
          variant="destructive"
          loading={busy}
          onPress={confirmDelete}
        />
      ) : null}
    </FormSheet>
  );
}
