import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { HeaderActions } from '@/components/header-actions';
import { proofPillKind, StatePill, type PillKind } from '@/components/state-pill';
import { showToast } from '@/components/toast';
import { dateTimeLabel, formatDuration, monthLabel, plural, shortMonthLabel } from '@/constants/format';
import { icons } from '@/constants/icons';
import { turnoverFailureMessage } from '@/constants/messages';
import { dayBounds, deleteTurnover, deviceTimeZone, restoreTurnover, type TurnoverSummary, useToday } from '@/data';
import { useTurnoverSummaries } from '@/hooks/use-turnovers';
import { shareHistoryCsv } from '@/native/exports';
import { haptics } from '@/native/haptics';
import { CHROME_FONT_CAP, hairline, radius, spacing, touchTarget, useTheme } from '@/theme';

const MONTHS = 12;

type Row =
  | { type: 'header'; key: string; title: string; count: number }
  | { type: 'turnover'; key: string; summary: TurnoverSummary; first: boolean; last: boolean };

function monthKeys(today: string): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function nextMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, m ?? 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function MonthStrip({ months, value, onChange }: { months: string[]; value: string; onChange: (m: string) => void }) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.md }}
      style={{ marginHorizontal: -spacing.md, flexGrow: 0 }}
    >
      {[...months].reverse().map((m) => {
        const selected = m === value;
        return (
          <Pressable
            key={m}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={monthLabel(m)}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(m);
            }}
            style={({ pressed }) => ({
              minHeight: touchTarget,
              minWidth: 56,
              paddingHorizontal: spacing.sm,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.accent : pressed ? colors.border : colors.surfaceSunken,
            })}
          >
            <AppText variant="callout" weight="600" maxFontSizeMultiplier={CHROME_FONT_CAP} style={{ color: selected ? colors.onAccent : colors.text }}>
              {shortMonthLabel(m)}
            </AppText>
            {m.slice(0, 4) !== months[0]!.slice(0, 4) ? (
              <AppText variant="caption" maxFontSizeMultiplier={CHROME_FONT_CAP} style={{ color: selected ? colors.onAccent : colors.textSecondary }}>
                {m.slice(0, 4)}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function statusPill(s: TurnoverSummary): PillKind {
  if (s.turnover.status === 'in-progress') return 'in-progress';
  if (s.turnover.status === 'abandoned') return 'abandoned';
  return proofPillKind(s.proofState === 'none' ? null : s.proofState);
}

/**
 * Deletes a finished / abandoned turnover after a confirmation, with Undo in the toast (the data
 * layer keeps the photos and any live link until the undo window closes). Running ones are refused.
 */
function confirmDelete(s: TurnoverSummary) {
  const t = s.turnover;
  if (t.status === 'in-progress') {
    showToast({ message: turnoverFailureMessage('in-progress') });
    return;
  }
  haptics.warning();
  const parts = [s.photosCount ? plural(s.photosCount, 'photo') : null, s.issuesCount ? plural(s.issuesCount, 'issue') : null].filter(Boolean);
  Alert.alert(
    'Delete this turnover?',
    `${parts.length ? `Its ${parts.join(' and ')} are removed from this phone. ` : ''}${
      s.proofState === 'active' ? 'Its proof link stops working. ' : ''
    }You can undo for a few seconds.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const r = await deleteTurnover(t.id);
          if (!r.ok) {
            haptics.error();
            showToast({ message: turnoverFailureMessage(r.reason) });
            return;
          }
          showToast({
            message: 'Turnover deleted',
            actionLabel: 'Undo',
            onAction: () => {
              void restoreTurnover(t.id).then((u) => {
                if (!u.ok) showToast({ message: turnoverFailureMessage(u.reason) });
              });
            },
          });
        },
      },
    ],
  );
}

function TurnoverRow({ summary, first, last }: { summary: TurnoverSummary; first: boolean; last: boolean }) {
  const { colors } = useTheme();
  const turnover = summary.turnover;
  const issues = summary.issuesCount;
  const when = turnover.startedAt ?? turnover.scheduledFor;
  const p = turnover.progress;
  const parts = [
    turnover.status === 'in-progress' ? 'Running' : formatDuration(turnover.durationSeconds ?? turnover.elapsedSeconds),
    p ? `${p.roomsDone}/${p.roomsTotal} rooms` : null,
    issues ? plural(issues, 'issue') : null,
  ].filter(Boolean);
  const pill = statusPill(summary);
  const deletable = turnover.status !== 'in-progress';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${dateTimeLabel(when)}, ${parts.join(', ')}`}
      accessibilityHint={deletable ? 'Long-press to delete' : undefined}
      accessibilityActions={deletable ? [{ name: 'delete', label: 'Delete turnover' }] : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'delete') confirmDelete(summary);
      }}
      onLongPress={deletable ? () => confirmDelete(summary) : undefined}
      onPress={() =>
        turnover.status === 'in-progress'
          ? router.push({ pathname: '/turnover/[id]', params: { id: turnover.id } })
          : router.push({ pathname: '/history/[id]', params: { id: turnover.id } })
      }
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.surfaceSunken : colors.surfaceElevated,
        borderTopLeftRadius: first ? radius.md : 0,
        borderTopRightRadius: first ? radius.md : 0,
        borderBottomLeftRadius: last ? radius.md : 0,
        borderBottomRightRadius: last ? radius.md : 0,
        borderCurve: 'continuous',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        minHeight: touchTarget + spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        borderBottomWidth: last ? 0 : hairline,
        borderBottomColor: colors.separator,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body">{dateTimeLabel(when)}</AppText>
        <AppText variant="callout" tone={issues ? 'issue' : 'secondary'}>
          {parts.join(' · ')}
        </AppText>
      </View>
      <StatePill kind={pill} />
    </Pressable>
  );
}

/**
 * History: a month strip, then that month's turnovers grouped by property (virtualized). Rows read
 * counts and proof state from `useTurnoverSummaries` (local tables only); long-press deletes.
 */
export function HistoryScreen() {
  const today = useToday();
  const tz = deviceTimeZone();
  const months = monthKeys(today);
  const [month, setMonth] = useState(months[0]!);
  const from = dayBounds(`${month}-01`, tz).start;
  const to = dayBounds(`${nextMonth(month)}-01`, tz).start;
  const list = useTurnoverSummaries({ from, to }).filter((s) => s.turnover.status !== 'scheduled');
  const [exporting, setExporting] = useState(false);

  const byProperty = new Map<string, TurnoverSummary[]>();
  for (const s of [...list].sort((a, b) => Date.parse(b.turnover.scheduledFor) - Date.parse(a.turnover.scheduledFor))) {
    const name = s.property?.name ?? 'Deleted property';
    byProperty.set(name, [...(byProperty.get(name) ?? []), s]);
  }
  const rows: Row[] = [];
  for (const [name, items] of [...byProperty.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    rows.push({ type: 'header', key: `h:${name}`, title: name, count: items.length });
    items.forEach((s, i) => rows.push({ type: 'turnover', key: s.turnover.id, summary: s, first: i === 0, last: i === items.length - 1 }));
  }

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const r = await shareHistoryCsv();
      if (!r.ok) showToast({ message: r.reason === 'unavailable' ? "Sharing isn't available on this device." : "Couldn't export. Please try again." });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <FlashList
        data={rows}
        keyExtractor={(r) => r.key}
        getItemType={(r) => r.type}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xxl }}
        ListHeaderComponent={
          <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
            <MonthStrip months={months} value={month} onChange={setMonth} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon={icons.history} title={`No turnovers in ${monthLabel(month)}`} body="Finished and abandoned turnovers appear here with their proof links." />
        }
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <View style={{ paddingTop: spacing.lg, paddingBottom: spacing.xs, paddingHorizontal: spacing.md, flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="callout" tone="secondary" weight="600" accessibilityRole="header">
                {item.title}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {plural(item.count, 'turnover')}
              </AppText>
            </View>
          ) : (
            <TurnoverRow summary={item.summary} first={item.first} last={item.last} />
          )
        }
      />
      <HeaderActions actions={[{ key: 'csv', icon: icons.csv, label: 'Export history as CSV', onPress: exportCsv }]} />
    </>
  );
}
