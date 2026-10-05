import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CountdownLabel } from '@/components/countdown-label';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { showToast } from '@/components/toast';
import { dateLabel, plural } from '@/constants/format';
import { icons, roomIcons } from '@/constants/icons';
import { deleteTurnover, restoreTurnover, type TurnoverView } from '@/data';
import { haptics } from '@/native/haptics';
import { hairline, spacing, useTheme } from '@/theme';

import { startAndOpen } from './turnover-actions';

/** A scheduled turnover: when, the walk-through, access notes and supplies, and a big Start. */
export function StartView({ turnover }: { turnover: TurnoverView }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [starting, setStarting] = useState(false);
  const property = turnover.property;
  const rooms = property?.rooms ?? [];

  const confirmDelete = () => {
    haptics.warning();
    Alert.alert('Delete this turnover?', 'It is removed from the schedule and its reminder is cancelled.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const r = await deleteTurnover(turnover.id);
          if (r.ok) {
            showToast({ message: 'Turnover deleted', actionLabel: 'Undo', onAction: () => void restoreTurnover(turnover.id) });
            if (router.canGoBack()) router.back();
            else router.replace('/today');
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Stack.Screen options={{ title: property?.name ?? 'Turnover' }} />
      <Screen>
        <View style={{ gap: spacing.xs }}>
          <AppText variant="title" accessibilityRole="header">
            {dateLabel(turnover.scheduledFor)}
          </AppText>
          <CountdownLabel scheduledFor={turnover.scheduledFor} countdown={turnover.countdown} overdue={turnover.overdue} />
          {property?.address ? (
            <AppText variant="callout" tone="secondary" selectable>
              {property.address}
            </AppText>
          ) : null}
        </View>

        {property?.accessNotes ? (
          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Access notes" />
            <ListGroup>
              <ListRow icon={icons.key} title={property.accessNotes} selectable />
            </ListGroup>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="Walk-through" detail={plural(rooms.length, 'room')} />
          <ListGroup>
            {rooms.map((r, i) => (
              <ListRow
                key={r.id}
                leading={<Icon name={roomIcons[r.kind]} size={22} color={colors.accentText} />}
                title={`${i + 1}. ${r.name}`}
                subtitle={`${plural(r.items.length, 'item')}${r.requiresAfterPhoto ? ' · after photo' : ''}`}
              />
            ))}
          </ListGroup>
        </View>

        {property && property.supplies.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Supplies to check" />
            <ListGroup>
              <ListRow icon={icons.supplies} title={property.supplies.join(', ')} />
            </ListGroup>
          </View>
        ) : null}

        <View style={{ gap: spacing.xs }}>
          <PrimaryButton
            title="Reschedule"
            icon={icons.calendar}
            variant="secondary"
            onPress={() => router.push({ pathname: '/schedule', params: { turnoverId: turnover.id } })}
          />
          <PrimaryButton title="Delete turnover" icon={icons.trash} variant="ghost" onPress={confirmDelete} />
        </View>
      </Screen>
      <View
        style={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.sm,
          borderTopWidth: hairline,
          borderTopColor: colors.separator,
          backgroundColor: colors.surface,
        }}
      >
        <PrimaryButton
          title="Start turnover"
          icon={icons.play}
          size="lg"
          loading={starting}
          disabled={rooms.length === 0}
          accessibilityHint="Starts the timer and opens the first room"
          onPress={async () => {
            setStarting(true);
            try {
              await startAndOpen(turnover.id, { stay: true });
            } finally {
              setStarting(false);
            }
          }}
        />
      </View>
    </View>
  );
}
