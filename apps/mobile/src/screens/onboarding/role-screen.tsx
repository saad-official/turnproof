import type { UserRole } from '@turnproof/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { PrimaryButton } from '@/components/primary-button';
import { icons, type IconName } from '@/constants/icons';
import { updateSettings } from '@/data';
import { useSettings } from '@/hooks/use-settings';
import { haptics } from '@/native/haptics';
import { actionTarget, radius, spacing, useTheme } from '@/theme';

import { PrimingLayout } from './priming-layout';

export const ROLE_OPTIONS: readonly { value: UserRole; title: string; body: string; icon: IconName }[] = [
  { value: 'cleaner', title: 'I clean turnovers', body: 'Checklists, stamped photos and a link to send the host.', icon: icons.sparkles },
  { value: 'host', title: 'I host short-term rentals', body: 'Set up properties, share them with your cleaner and see the proof.', icon: icons.properties },
  { value: 'both', title: 'Both', body: 'You clean some of your own places and work with cleaners on others.', icon: icons.people },
];

function RoleCard({ option, selected, onPress }: { option: (typeof ROLE_OPTIONS)[number]; selected: boolean; onPress: () => void }) {
  const { colors, shadow } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${option.title}. ${option.body}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: actionTarget + spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        backgroundColor: selected ? colors.accentSoft : pressed ? colors.surfaceSunken : colors.surfaceElevated,
        borderWidth: 2,
        borderColor: selected ? colors.accent : 'transparent',
        boxShadow: selected ? undefined : shadow('sm'),
      })}
    >
      <Icon name={option.icon} size={26} color={colors.accentText} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body" weight="600">
          {option.title}
        </AppText>
        <AppText variant="callout" tone="secondary">
          {option.body}
        </AppText>
      </View>
      {selected ? <Icon name={icons.checkCircle} size={24} color={colors.accent} /> : null}
    </Pressable>
  );
}

/** Role picker → `settings.role` (it only changes emphasis: hosts see sharing first). */
export function RoleScreen() {
  const settings = useSettings();
  const [role, setRole] = useState<UserRole>(settings.role);
  const [saving, setSaving] = useState(false);
  const next = async () => {
    setSaving(true);
    try {
      await updateSettings({ role });
      router.push('/camera');
    } finally {
      setSaving(false);
    }
  };
  return (
    <PrimingLayout
      icon={icons.role}
      step="Step 1 of 3"
      title="How will you use Turnproof?"
      body="You can change this later in Settings."
      actions={<PrimaryButton title="Continue" size="lg" loading={saving} onPress={next} />}
    >
      <View accessibilityRole="radiogroup" accessibilityLabel="Your role" style={{ gap: spacing.sm }}>
        {ROLE_OPTIONS.map((o) => (
          <RoleCard
            key={o.value}
            option={o}
            selected={role === o.value}
            onPress={() => {
              haptics.selection();
              setRole(o.value);
            }}
          />
        ))}
      </View>
    </PrimingLayout>
  );
}
