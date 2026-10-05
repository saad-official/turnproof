import type { IssueSeverity } from '@turnproof/shared';
import { Pressable, View } from 'react-native';

import { haptics } from '@/native/haptics';
import { actionTarget, radius, spacing, useTheme } from '@/theme';

import { AppText } from './app-text';

export const SEVERITIES: readonly { value: IssueSeverity; label: string; detail: string }[] = [
  { value: 'low', label: 'Minor', detail: 'Worth noting for the host' },
  { value: 'medium', label: 'Needs attention', detail: 'Should be fixed before the next guest' },
  { value: 'high', label: 'Damage', detail: 'Broken, unsafe or a likely claim' },
];

export function severityLabel(s: IssueSeverity): string {
  return SEVERITIES.find((x) => x.value === s)?.label ?? s;
}

/** Three large radio rows; the selected one fills coral (issues only ever use coral). */
export function SeverityPicker({ value, onChange }: { value: IssueSeverity; onChange: (s: IssueSeverity) => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Severity" style={{ gap: spacing.xs }}>
      {SEVERITIES.map((s) => {
        const selected = s.value === value;
        return (
          <Pressable
            key={s.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${s.label}, ${s.detail}`}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(s.value);
            }}
            style={({ pressed }) => ({
              minHeight: actionTarget,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radius.sm,
              borderCurve: 'continuous',
              justifyContent: 'center',
              gap: 2,
              backgroundColor: selected ? colors.issue : pressed ? colors.border : colors.surfaceSunken,
            })}
          >
            <AppText variant="body" weight="600" tone={selected ? 'onIssue' : 'primary'}>
              {s.label}
            </AppText>
            <AppText variant="caption" tone={selected ? 'onIssue' : 'secondary'}>
              {s.detail}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
