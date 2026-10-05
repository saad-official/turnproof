import type { UserRole } from '@turnproof/shared';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { SegmentedControl } from '@/components/segmented-control';
import { showToast } from '@/components/toast';
import { ToggleRow } from '@/components/toggle-row';
import { dateTimeLabel, plural } from '@/constants/format';
import { icons } from '@/constants/icons';
import { links } from '@/constants/links';
import { deleteAllLocalData, seedDemoData, signOutAndForget, syncNow, updateSettings } from '@/data';
import {
  PROOF_DAY_OPTIONS,
  setAppearance,
  setProofExpiryDays,
  useAppearance,
  useProofExpiryDays,
  type AppearancePreference,
} from '@/hooks/use-app-preferences';
import { useLocationPermission, useNotificationPermission } from '@/hooks/use-permissions';
import { useSession } from '@/hooks/use-session';
import { useSettings } from '@/hooks/use-settings';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { useUploadQueue } from '@/hooks/use-upload-queue';
import { requestLocationPermission } from '@/native/capture';
import { shareHistoryCsv } from '@/native/exports';
import { haptics } from '@/native/haptics';
import { openNotificationSettings, requestNotificationPermission } from '@/native/notifications';
import { spacing, useTheme } from '@/theme';

const ROLES: readonly { value: UserRole; label: string }[] = [
  { value: 'cleaner', label: 'Cleaner' },
  { value: 'host', label: 'Host' },
  { value: 'both', label: 'Both' },
];

const LEADS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 h' },
  { value: 120, label: '2 h' },
] as const;

const APPEARANCE: readonly { value: AppearancePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function open(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => undefined);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}

/** Settings: account, role, proof links, stamps, reminders, appearance, uploads, data, about. */
export function SettingsScreen() {
  const { colors } = useTheme();
  const settings = useSettings();
  const { data: session } = useSession();
  const sync = useSyncStatus();
  const queue = useUploadQueue();
  const appearance = useAppearance();
  const proofDays = useProofExpiryDays();
  const [notif, refreshNotif] = useNotificationPermission();
  const [location, refreshLocation] = useLocationPermission();
  const [exporting, setExporting] = useState(false);

  const user = session?.user;
  const reminderStatus = notif === null ? '…' : notif.status === 'granted' ? 'On' : notif.status === 'denied' ? 'Off' : 'Not set up';

  const fixReminders = async () => {
    const r = await requestNotificationPermission().catch(() => null);
    if (r && r.status !== 'granted' && !r.canAskAgain) openNotificationSettings().catch(() => undefined);
    refreshNotif();
  };

  const toggleGps = async (on: boolean) => {
    await updateSettings({ stampGps: on });
    if (on && location?.status !== 'granted') {
      const r = await requestLocationPermission();
      if (r.status !== 'granted' && !r.canAskAgain) Linking.openSettings().catch(() => undefined);
      refreshLocation();
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'Turnovers and photos stay on this phone. Uploads pause until you sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOutAndForget();
          showToast({ message: 'Signed out' });
        },
      },
    ]);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const r = await shareHistoryCsv();
      if (!r.ok) showToast({ message: r.reason === 'unavailable' ? "Sharing isn't available on this device." : "Couldn't export. Please try again." });
    } finally {
      setExporting(false);
    }
  };

  const confirmWipe = () => {
    haptics.warning();
    Alert.alert(
      'Delete all data on this phone?',
      'Every property, turnover, photo and setting on this phone is deleted. Anything already synced to your account stays there.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            await deleteAllLocalData();
            showToast({ message: 'All local data deleted' });
          },
        },
      ],
    );
  };

  const uploadSubtitle =
    queue.paused === 'offline'
      ? `Waiting for a connection · ${plural(queue.pending, 'photo')} to go`
      : queue.paused === 'signed-out'
        ? queue.pending
          ? `Sign in to upload ${plural(queue.pending, 'photo')}`
          : 'Photos upload when you sign in'
        : queue.running
          ? `Uploading · ${plural(queue.pending, 'photo')} left`
          : queue.counts.failed > 0
            ? `${plural(queue.counts.failed, 'photo')} failed${queue.lastError ? `: ${queue.lastError}` : ''}`
            : queue.pending > 0
              ? `${plural(queue.pending, 'photo')} waiting to upload`
              : 'All photos are uploaded';

  return (
    <Screen>
      <Section title="Account">
        <ListGroup footer={user ? undefined : 'An account is only needed to publish proof links and share properties. Everything else works offline.'}>
          {user ? (
            <>
              <ListRow icon={icons.account} title={user.name || user.email} subtitle={user.name ? user.email : undefined} selectable />
              <ListRow
                icon={icons.refresh}
                title="Sync now"
                subtitle={
                  sync.error ? `Last sync failed: ${sync.error}` : sync.lastSyncAt ? `Last synced ${dateTimeLabel(sync.lastSyncAt)}` : 'Not synced yet'
                }
                trailing={sync.running ? <ActivityIndicator color={colors.accentText} /> : undefined}
                onPress={() => void syncNow()}
                disabled={sync.running}
              />
              <ListRow icon={icons.logout} title="Sign out" onPress={confirmSignOut} chevron={false} />
              <ListRow icon={icons.trash} title="Delete account" tone="issue" onPress={() => router.push('/delete-account')} />
            </>
          ) : (
            <>
              <ListRow icon={icons.account} title="Sign in" onPress={() => router.push({ pathname: '/account', params: { mode: 'signin' } })} />
              <ListRow icon={icons.personAdd} title="Create an account" onPress={() => router.push({ pathname: '/account', params: { mode: 'signup' } })} />
            </>
          )}
        </ListGroup>
      </Section>

      <Section title="Your role">
        <SegmentedControl accessibilityLabel="Your role" options={ROLES} value={settings.role} onChange={(role) => void updateSettings({ role })} />
      </Section>

      <Section title="Proof links">
        <SegmentedControl
          accessibilityLabel="New proof links expire after"
          options={PROOF_DAY_OPTIONS.map((d) => ({ value: d, label: `${d} days` }))}
          value={proofDays}
          onChange={setProofExpiryDays}
        />
        <AppText variant="caption" tone="secondary" style={{ paddingHorizontal: spacing.md }}>
          How long a newly published link stays open. You can revoke any link early from its turnover.
        </AppText>
      </Section>

      <Section title="Photo stamps">
        <ListGroup footer="Every photo is stamped with the time, the device and a SHA-256 fingerprint. Location is read once per photo, only while the camera is open.">
          <ToggleRow icon={icons.location} title="Add location to stamps" value={settings.stampGps} onValueChange={(v) => void toggleGps(v)} />
          {settings.stampGps && location && location.status !== 'granted' ? (
            <ListRow
              icon={icons.locationOff}
              title="Location access is off"
              subtitle="Stamps are saved without a location."
              tone="accent"
              onPress={() => void toggleGps(true)}
            />
          ) : null}
        </ListGroup>
      </Section>

      <Section title="Reminders">
        <ListGroup>
          <ListRow
            icon={notif?.status === 'granted' ? icons.bell : icons.bellOff}
            title="Notifications"
            value={reminderStatus}
            onPress={notif?.status === 'granted' ? () => openNotificationSettings().catch(() => undefined) : fixReminders}
          />
        </ListGroup>
        <SegmentedControl
          accessibilityLabel="Remind me before checkout"
          options={LEADS}
          value={(LEADS.find((l) => l.value === settings.reminderLeadMinutes)?.value ?? 60) as 30 | 60 | 120}
          onChange={(v) => void updateSettings({ reminderLeadMinutes: v })}
        />
      </Section>

      <Section title="Appearance">
        <SegmentedControl accessibilityLabel="Appearance" options={APPEARANCE} value={appearance} onChange={setAppearance} />
      </Section>

      <Section title="Uploads">
        <ListGroup>
          <ListRow
            icon={queue.counts.failed > 0 || queue.paused ? icons.uploadOff : icons.upload}
            title="Photo uploads"
            subtitle={uploadSubtitle}
            trailing={
              queue.counts.failed > 0 ? (
                <PrimaryButton title="Retry" size="sm" variant="secondary" block={false} onPress={queue.retry} />
              ) : queue.running ? (
                <ActivityIndicator color={colors.accentText} />
              ) : undefined
            }
            onPress={queue.kick}
            chevron={false}
          />
        </ListGroup>
      </Section>

      <Section title="Data">
        <ListGroup>
          <ListRow icon={icons.csv} title={exporting ? 'Exporting…' : 'Export history (CSV)'} onPress={exportCsv} disabled={exporting} />
          <ListRow icon={icons.trash} title="Delete all data on this phone" tone="issue" onPress={confirmWipe} />
          {__DEV__ ? <ListRow icon={icons.dev} title="Load demo data (dev)" onPress={() => void seedDemoData().then(() => showToast({ message: 'Demo data loaded' }))} /> : null}
        </ListGroup>
      </Section>

      <Section title="About">
        <ListGroup footer="Turnproof is free: no purchases, no ads.">
          <ListRow icon={icons.info} title="Version" value={Constants.expoConfig?.version ?? '–'} />
          <ListRow icon={icons.shield} title="Privacy" onPress={() => open(links.privacy)} />
          <ListRow icon={icons.help} title="Support" onPress={() => open(links.support)} />
          <ListRow icon={icons.doc} title="Terms" onPress={() => open(links.terms)} />
        </ListGroup>
      </Section>
    </Screen>
  );
}
