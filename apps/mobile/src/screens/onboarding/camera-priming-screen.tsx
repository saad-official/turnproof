import { useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { PrimaryButton } from '@/components/primary-button';
import { icons } from '@/constants/icons';
import { updateSettings } from '@/data';
import { requestLocationPermission } from '@/native/capture';
import { haptics } from '@/native/haptics';
import { spacing, useTheme } from '@/theme';

import { PrimingLayout } from './priming-layout';

function Point({ text, done }: { text: string; done?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <Icon name={done ? icons.checkCircle : icons.check} size={20} color={colors.accentText} />
      <AppText variant="callout" tone="secondary" style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

/**
 * Camera priming, then location: explains why before either system prompt. Denying location keeps
 * stamps without coordinates (GPS stamping is switched off so no "no GPS" notes appear).
 */
export function CameraPrimingScreen() {
  const [camera, requestCamera] = useCameraPermissions();
  const [stage, setStage] = useState<'camera' | 'location'>(camera?.granted ? 'location' : 'camera');
  const [busy, setBusy] = useState(false);

  const askCamera = async () => {
    setBusy(true);
    try {
      const r = await requestCamera();
      if (r.granted) haptics.selection();
      else if (!r.canAskAgain) await Linking.openSettings().catch(() => undefined);
      setStage('location');
    } finally {
      setBusy(false);
    }
  };

  const askLocation = async () => {
    setBusy(true);
    try {
      const r = await requestLocationPermission();
      await updateSettings({ stampGps: r.status === 'granted' });
      router.push('/notifications');
    } finally {
      setBusy(false);
    }
  };

  const skipLocation = async () => {
    await updateSettings({ stampGps: false });
    router.push('/notifications');
  };

  if (stage === 'camera') {
    return (
      <PrimingLayout
        icon={icons.camera}
        step="Step 2 of 3"
        title="Photos are the proof"
        body="Turnproof takes before and after photos of each room with your camera. Photos from your library can only be added as labelled reference shots."
        actions={
          <>
            <PrimaryButton title="Allow camera" icon={icons.camera} size="lg" loading={busy} onPress={askCamera} />
            <PrimaryButton title="Not now" variant="ghost" onPress={() => setStage('location')} />
          </>
        }
      >
        <View style={{ gap: spacing.sm }}>
          <Point text="Every photo gets the time and a fingerprint of the file." />
          <Point text="Photos stay on this phone until you publish a proof link." />
        </View>
      </PrimingLayout>
    );
  }

  return (
    <PrimingLayout
      icon={icons.location}
      step="Step 2 of 3"
      title="Add the place to each stamp"
      body="With location on, each photo's stamp records where it was taken, so a host can see it was at the property. Turnproof only looks while you take a photo."
      actions={
        <>
          <PrimaryButton title="Allow location" icon={icons.location} size="lg" loading={busy} onPress={askLocation} />
          <PrimaryButton title="Stamp without location" variant="ghost" onPress={skipLocation} />
        </>
      }
    >
      {camera?.granted ? <Point text="Camera is ready." done /> : null}
    </PrimingLayout>
  );
}
