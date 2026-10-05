// Onboarding artwork built from the app's own primitives (no bitmaps): a checklist card, a stamped
// before/after pair and the host's proof link.
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { StampChip } from '@/components/photo-tile';
import { StatePill } from '@/components/state-pill';
import { icons, roomIcons } from '@/constants/icons';
import { radius, spacing, useTheme } from '@/theme';

const ART_WIDTH = 280;

function Card({ children }: { children: React.ReactNode }) {
  const { colors, shadow } = useTheme();
  return (
    <View
      style={{
        width: ART_WIDTH,
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        padding: spacing.md,
        gap: spacing.sm,
        boxShadow: shadow('lg'),
      }}
    >
      {children}
    </View>
  );
}

export function ChecklistArt() {
  const { colors } = useTheme();
  const rows = [
    { label: 'Fresh linen and made bed', done: true },
    { label: 'Mirrors', done: true },
    { label: 'Vacuum floor', done: false },
  ];
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Icon name={roomIcons.bedroom} size={20} color={colors.accentText} />
          <AppText variant="headline" style={{ flex: 1 }}>
            Bedroom
          </AppText>
          <AppText variant="caption" tone="secondary" tabular>
            2 of 3
          </AppText>
        </View>
        {rows.map((r) => (
          <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: radius.pill,
                borderWidth: 2,
                borderColor: r.done ? colors.accent : colors.border,
                backgroundColor: r.done ? colors.accent : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {r.done ? <Icon name={icons.check} size={13} color={colors.onAccent} weight="bold" /> : null}
            </View>
            <AppText variant="callout" tone={r.done ? 'secondary' : 'primary'}>
              {r.label}
            </AppText>
          </View>
        ))}
        <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.track, overflow: 'hidden' }}>
          <View style={{ width: '66%', height: 8, borderRadius: radius.pill, backgroundColor: colors.accent }} />
        </View>
      </Card>
    </View>
  );
}

function MockPhoto({ label, kind, verified }: { label: string; kind: 'before' | 'after'; verified?: boolean }) {
  const { colors } = useTheme();
  const at = new Date();
  at.setHours(kind === 'before' ? 11 : 12, kind === 'before' ? 4 : 31, 0, 0);
  return (
    <View style={{ gap: spacing.xs, alignItems: 'center' }}>
      <View
        style={{
          width: 128,
          height: 160,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: kind === 'before' ? colors.surfaceSunken : colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Icon name={kind === 'before' ? roomIcons.bedroom : icons.sparkles} size={44} color={kind === 'before' ? colors.textTertiary : colors.accentText} />
        {verified ? (
          <View
            style={{
              position: 'absolute',
              top: spacing.xs,
              end: spacing.xs,
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
        <View style={{ position: 'absolute', bottom: spacing.xs, start: spacing.xs }}>
          <StampChip takenAt={at.toISOString()} hasGps />
        </View>
      </View>
      <AppText variant="caption" tone="secondary" weight="600">
        {label}
      </AppText>
    </View>
  );
}

export function StampedPairArt() {
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', gap: spacing.md }}>
      <MockPhoto label="Before" kind="before" />
      <MockPhoto label="After" kind="after" verified />
    </View>
  );
}

export function ProofLinkArt() {
  const { colors } = useTheme();
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Icon name={icons.link} size={18} color={colors.accentText} />
          <AppText variant="callout" tone="accent" weight="600" numberOfLines={1} style={{ flex: 1 }}>
            getturnproof.vercel.app/p/7hk3m…
          </AppText>
        </View>
        <AppText variant="headline">Maple St · Turnover</AppText>
        <AppText variant="callout" tone="secondary">
          5 rooms · 38 photos · 1 issue · 1 h 42 min
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
          <StatePill kind="verified" />
          <StatePill kind="proof-active" label="Expires in 60 days" />
        </View>
      </Card>
    </View>
  );
}
