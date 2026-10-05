import { proofState } from '@turnproof/shared';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { HeaderActions } from '@/components/header-actions';
import { proofPillKind, StatePill, type PillKind } from '@/components/state-pill';
import { showToast } from '@/components/toast';
import { dateTimeLabel, formatDuration, monthLabel, plural, shortMonthLabel } from '@/constants/format';
import { icons } from '@/constants/icons';
import { dayBounds, deviceTimeZone, listIssues, listProofs, type TurnoverView, useToday } from '@/data';
import { useTurnoversBetween } from '@/hooks/use-turnovers';
import { shareHistoryCsv } from '@/native/exports';
import { haptics } from '@/native/haptics';
import { CHROME_FONT_CAP, hairline, radius, spacing, touchTarget, useTheme } from '@/theme';

const MONTHS = 12;

type Row =
  | { type: 'header'; key: string; title: string; count: number }
  | { type: 'turnover'; key: string; turnover: TurnoverView; first: boolean; last: boolean };

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

function statusPill(t: TurnoverView, now: string): PillKind {
  if (t.status === 'in-progress') return 'in-progress';
  if (t.status === 'abandoned') return 'abandoned';
  const latest = listProofs(t.id)[0];
  return proofPillKind(latest ? proofState(latest, now) : null);
}

function TurnoverRow({ turnover, first, last, now }: { turnover: TurnoverView; first: boolean; last: boolean; now: string }) {
  const { colors } = useTheme();
  const issues = listIssues(turnover.id).length;
  const when = turnover.startedAt ?? turnover.scheduledFor;
  const p = turnover.progress;
  const parts = [
    turnover.status === 'in-progress' ? 'Running' : formatDuration(turnover.durationSeconds ?? turnover.elapsedSeconds),
    p ? `${p.roomsDone}/${p.roomsTotal} rooms` : null,
    issues ? plural(issues, 'issue') : null,
  ].filter(Boolean);
  const pill = statusPill(turnover, now);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${dateTimeLabel(when)}, ${parts.join(', ')}`}
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

/** History: a month strip, then that month's turnovers grouped by property (virtualized). */
export function HistoryScreen() {
  const today = useToday();
  const tz = deviceTimeZone();
  const months = monthKeys(today);
  const [month, setMonth] = useState(months[0]!);
  const from = dayBounds(`${month}-01`, tz).start;
  const to = dayBounds(`${nextMonth(month)}-01`, tz).start;
  const list = useTurnoversBetween(from, to).filter((t) => t.status !== 'scheduled');
  const now = new Date().toISOString();
  const [exporting, setExporting] = useState(false);

  const byProperty = new Map<string, TurnoverView[]>();
  for (const t of [...list].sort((a, b) => Date.parse(b.scheduledFor) - Date.parse(a.scheduledFor))) {
    const name = t.property?.name ?? 'Deleted property';
    byProperty.set(name, [...(byProperty.get(name) ?? []), t]);
  }
  const rows: Row[] = [];
  for (const [name, items] of [...byProperty.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    rows.push({ type: 'header', key: `h:${name}`, title: name, count: items.length });
    items.forEach((t, i) => rows.push({ type: 'turnover', key: t.id, turnover: t, first: i === 0, last: i === items.length - 1 }));
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
              <AppText variant="caption" tone="tertiary">
                {plural(item.count, 'turnover')}
              </AppText>
            </View>
          ) : (
            <TurnoverRow turnover={item.turnover} first={item.first} last={item.last} now={now} />
          )
        }
      />
      <HeaderActions actions={[{ key: 'csv', icon: icons.csv, label: 'Export history as CSV', onPress: exportCsv }]} />
    </>
  );
}
