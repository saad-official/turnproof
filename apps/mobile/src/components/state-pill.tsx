import { View } from 'react-native';

import { icons, type IconName } from '@/constants/icons';
import { CHROME_FONT_CAP, radius, spacing, useTheme, type ThemeColors } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

export type PillKind =
  | 'proof-active'
  | 'proof-expired'
  | 'proof-revoked'
  | 'proof-none'
  | 'scheduled'
  | 'in-progress'
  | 'finished'
  | 'forced'
  | 'abandoned'
  | 'overdue'
  | 'verified'
  | 'reference'
  | 'done'
  | 'shared'
  | 'issue';

type Meta = { label: string; fg: keyof ThemeColors; bg: keyof ThemeColors; icon?: IconName };

const META: Record<PillKind, Meta> = {
  'proof-active': { label: 'Link live', fg: 'accentText', bg: 'accentSoft', icon: icons.link },
  'proof-expired': { label: 'Link expired', fg: 'textSecondary', bg: 'surfaceSunken', icon: icons.clock },
  'proof-revoked': { label: 'Link revoked', fg: 'textSecondary', bg: 'surfaceSunken', icon: icons.close },
  'proof-none': { label: 'No link', fg: 'textSecondary', bg: 'surfaceSunken' },
  scheduled: { label: 'Scheduled', fg: 'textSecondary', bg: 'surfaceSunken', icon: icons.clock },
  'in-progress': { label: 'In progress', fg: 'onAccent', bg: 'accent', icon: icons.timer },
  finished: { label: 'Finished', fg: 'accentText', bg: 'accentSoft', icon: icons.check },
  forced: { label: 'Finished early', fg: 'warning', bg: 'warningSoft', icon: icons.info },
  abandoned: { label: 'Abandoned', fg: 'warning', bg: 'warningSoft', icon: icons.close },
  overdue: { label: 'Overdue', fg: 'issueText', bg: 'issueSoft', icon: icons.clock },
  verified: { label: 'Verified capture', fg: 'verifiedText', bg: 'verifiedSoft', icon: icons.verified },
  reference: { label: 'Reference, not proof', fg: 'textSecondary', bg: 'surfaceSunken', icon: icons.library },
  done: { label: 'Done', fg: 'accentText', bg: 'accentSoft', icon: icons.check },
  shared: { label: 'Shared', fg: 'accentText', bg: 'accentSoft', icon: icons.people },
  issue: { label: 'Issue', fg: 'issueText', bg: 'issueSoft', icon: icons.issue },
};

/** A small capsule for a state. Colour is never the only signal: every state has a word. */
export function StatePill({ kind, label }: { kind: PillKind; label?: string }) {
  const { colors } = useTheme();
  const meta = META[kind];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        paddingHorizontal: spacing.xs + 2,
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: colors[meta.bg],
        alignSelf: 'flex-start',
      }}
    >
      {meta.icon ? <Icon name={meta.icon} size={12} color={colors[meta.fg]} weight="bold" /> : null}
      <AppText variant="caption" weight="600" maxFontSizeMultiplier={CHROME_FONT_CAP} style={{ color: colors[meta.fg] }}>
        {label ?? meta.label}
      </AppText>
    </View>
  );
}

export function proofPillKind(state: 'active' | 'expired' | 'revoked' | null | undefined): PillKind {
  return state === 'active' ? 'proof-active' : state === 'expired' ? 'proof-expired' : state === 'revoked' ? 'proof-revoked' : 'proof-none';
}
