import { stampIsVerified, type Issue } from '@turnproof/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-row';
import { PhotoRow } from '@/components/photo-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { severityLabel } from '@/components/severity-picker';
import { StatePill } from '@/components/state-pill';
import { showToast } from '@/components/toast';
import { dateTimeLabel, formatDuration, plural } from '@/constants/format';
import { icons, roomIcons } from '@/constants/icons';
import type { LocalPhoto } from '@/data';
import { useIssues } from '@/hooks/use-issues';
import { usePhotos } from '@/hooks/use-photos';
import { useSettings } from '@/hooks/use-settings';
import { useTurnover } from '@/hooks/use-turnovers';
import { shareTurnoverPdf } from '@/native/exports';
import { radius, spacing, useTheme } from '@/theme';

import { ProofSection } from './proof-section';

const SUMMARY_TILE = 88;

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'issue' }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.md, gap: 2 }}
    >
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="headline" tabular tone={tone ?? 'primary'}>
        {value}
      </AppText>
    </View>
  );
}

function IssueRows({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <ListGroup>
      {issues.map((i) => (
        <ListRow key={i.id} tone="issue" icon={icons.issue} title={severityLabel(i.severity)} subtitle={i.note || (i.photoId ? 'Photo attached' : undefined)} />
      ))}
    </ListGroup>
  );
}

function openPhoto(p: LocalPhoto) {
  router.push({ pathname: '/photo/[id]', params: { id: p.id, turnoverId: p.turnoverId } });
}

/**
 * Finished (or abandoned) turnover: duration, rooms, photos, issues, the proof link, PDF export and
 * the per-room evidence. Shown after Finish (in place of the flow) and from History.
 */
export function TurnoverSummary({ id, context }: { id: string; context: 'flow' | 'history' }) {
  const { colors } = useTheme();
  const t = useTurnover(id);
  const photos = usePhotos(id);
  const issues = useIssues(id);
  const { stampGps } = useSettings();
  const [exporting, setExporting] = useState(false);

  const header = (
    <Stack.Screen options={{ title: t?.property?.name ?? 'Summary', headerTitle: undefined, headerRight: undefined }} />
  );

  if (!t) {
    return (
      <>
        {header}
        <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <EmptyState icon={icons.history} title="Turnover not found" body="It may have been deleted on another device." />
        </Screen>
      </>
    );
  }

  const finished = t.status === 'finished';
  const proofPhotos = photos.filter((p) => p.phase === 'before' || p.phase === 'after');
  const verified = proofPhotos.filter((p) => stampIsVerified(p.stamp, t, { stampGps }).verified).length;
  const rooms = t.property?.rooms ?? [];
  const otherIssues = issues.filter((i) => !i.roomId || !rooms.some((r) => r.id === i.roomId));
  const when = t.finishedAt ?? t.abandonedAt ?? t.startedAt ?? t.scheduledFor;

  const exportPdf = async () => {
    setExporting(true);
    try {
      const r = await shareTurnoverPdf(t.id);
      if (!r.ok) showToast({ message: r.reason === 'unavailable' ? "Sharing isn't available on this device." : "Couldn't build the PDF. Please try again." });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {header}
      <Screen>
        <View style={{ alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: radius.pill,
              backgroundColor: finished ? colors.accent : colors.warningSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={finished ? icons.check : icons.close} size={36} color={finished ? colors.onAccent : colors.warning} weight="bold" />
          </View>
          <AppText variant="title" align="center" accessibilityRole="header">
            {finished ? 'Turnover finished' : t.status === 'abandoned' ? 'Turnover abandoned' : 'Turnover'}
          </AppText>
          <AppText variant="callout" tone="secondary" align="center">
            {`${t.property?.name ?? 'Property'} · ${dateTimeLabel(when)}`}
          </AppText>
          {t.forced ? <StatePill kind="forced" /> : null}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          <Stat label="Duration" value={formatDuration(t.durationSeconds ?? t.elapsedSeconds)} />
          <Stat label="Rooms done" value={`${t.progress?.roomsDone ?? 0} of ${t.progress?.roomsTotal ?? 0}`} />
          <Stat label="Proof photos" value={`${proofPhotos.length} · ${verified} verified`} />
          <Stat label="Issues" value={String(issues.length)} tone={issues.length > 0 ? 'issue' : undefined} />
        </View>

        {t.note ? (
          <ListGroup>
            <ListRow icon={icons.note} title="Note" subtitle={t.note} selectable />
          </ListGroup>
        ) : null}

        {finished ? <ProofSection turnoverId={t.id} propertyName={t.property?.name ?? 'the property'} /> : null}

        <PrimaryButton title="Export PDF" icon={icons.pdf} variant="secondary" loading={exporting} onPress={exportPdf} />

        {rooms.map((room) => {
          const roomPhotos = photos.filter((p) => p.roomId === room.id);
          const progress = t.rooms.find((r) => r.roomId === room.id);
          const before = roomPhotos.filter((p) => p.phase === 'before');
          const after = roomPhotos.filter((p) => p.phase === 'after');
          const refs = roomPhotos.filter((p) => p.phase === 'reference');
          const roomIssues = issues.filter((i) => i.roomId === room.id);
          return (
            <View key={room.id} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md }}>
                <Icon name={roomIcons[room.kind]} size={20} color={colors.accentText} />
                <AppText variant="headline" style={{ flex: 1 }} accessibilityRole="header">
                  {room.name}
                </AppText>
                {progress?.complete ? <StatePill kind="done" /> : <StatePill kind="abandoned" label="Not done" />}
              </View>
              {progress ? (
                <AppText variant="caption" tone="secondary" style={{ paddingHorizontal: spacing.md }}>
                  {`${progress.checkedAll} of ${progress.totalAll} items · ${plural(before.length, 'before photo')} · ${plural(after.length, 'after photo')}`}
                </AppText>
              ) : null}
              <PhotoRow photos={before} turnover={t} stampGps={stampGps} size={SUMMARY_TILE} onPressPhoto={openPhoto} emptyLabel="No before photos" />
              <PhotoRow photos={after} turnover={t} stampGps={stampGps} size={SUMMARY_TILE} onPressPhoto={openPhoto} emptyLabel="No after photos" />
              {refs.length > 0 ? <PhotoRow photos={refs} stampGps={stampGps} size={SUMMARY_TILE} onPressPhoto={openPhoto} /> : null}
              <IssueRows issues={roomIssues} />
            </View>
          );
        })}

        {otherIssues.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Other issues" />
            <IssueRows issues={otherIssues} />
          </View>
        ) : null}

        {finished || t.status === 'abandoned' ? (
          <PrimaryButton
            title="Report an issue"
            icon={icons.issue}
            variant="ghost"
            onPress={() => router.push({ pathname: '/issue', params: { turnoverId: t.id } })}
          />
        ) : null}

        {context === 'flow' ? <PrimaryButton title="Back to Today" variant="ghost" onPress={() => router.dismissTo('/today')} /> : null}
      </Screen>
    </>
  );
}

/** Route wrapper: `summary/[id]` and `history/[id]`. */
export function SummaryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TurnoverSummary id={id} context="history" />;
}
