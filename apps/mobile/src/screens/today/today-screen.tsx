import { dayKeyOf, groupByDay } from '@turnproof/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CountdownLabel } from '@/components/countdown-label';
import { EmptyState } from '@/components/empty-state';
import { HeaderActions } from '@/components/header-actions';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { StatePill } from '@/components/state-pill';
import { dayLabel, plural } from '@/constants/format';
import { icons } from '@/constants/icons';
import { deviceTimeZone, seedDemoData, type TurnoverView, useToday } from '@/data';
import { useProperties } from '@/hooks/use-properties';
import { useActiveTurnover, useUpcomingTurnovers } from '@/hooks/use-turnovers';
import { spacing } from '@/theme';

import { startAndOpen } from '../turnover/turnover-actions';
import { ActiveTurnoverCard } from './active-turnover-card';

function UpcomingRow({ turnover, today }: { turnover: TurnoverView; today: string }) {
  const [starting, setStarting] = useState(false);
  const running = turnover.status === 'in-progress';
  const startable = turnover.status === 'scheduled' && dayKeyOf(turnover.scheduledFor, deviceTimeZone()) <= today;
  const rooms = turnover.property?.rooms.length ?? 0;
  const open = () => router.push({ pathname: '/turnover/[id]', params: { id: turnover.id } });
  return (
    <ListRow
      title={turnover.property?.name ?? 'Property'}
      onPress={open}
      accessibilityLabel={[
        turnover.property?.name,
        running ? 'in progress on another phone' : turnover.countdown,
        turnover.overdue ? 'overdue' : null,
        plural(rooms, 'room'),
      ]
        .filter(Boolean)
        .join(', ')}
      detail={
        running ? (
          <StatePill kind="in-progress" label="In progress on another phone" />
        ) : (
          <CountdownLabel scheduledFor={turnover.scheduledFor} countdown={turnover.countdown} overdue={turnover.overdue} />
        )
      }
      trailing={
        startable ? (
          <PrimaryButton
            title="Start"
            icon={icons.play}
            size="sm"
            variant={turnover.overdue ? 'primary' : 'secondary'}
            block={false}
            loading={starting}
            accessibilityLabel={`Start turnover at ${turnover.property?.name ?? 'property'}`}
            onPress={async () => {
              setStarting(true);
              try {
                await startAndOpen(turnover.id);
              } finally {
                setStarting(false);
              }
            }}
          />
        ) : undefined
      }
      chevron={!startable}
    />
  );
}

/** Today: the running turnover first, then the next 7 days by day, with Start on today's. */
export function TodayScreen() {
  const properties = useProperties();
  const upcoming = useUpcomingTurnovers(7);
  const active = useActiveTurnover();
  const today = useToday();
  const tz = deviceTimeZone();
  const list = upcoming.filter((t) => t.id !== active?.id);
  const groups = groupByDay(list, tz);
  const schedule = () => router.push('/schedule');

  return (
    <>
      <Screen>
        {active ? <ActiveTurnoverCard id={active.id} /> : null}

        {properties.length === 0 ? (
          <EmptyState
            icon={icons.properties}
            title="Add your first property"
            body="A property holds its rooms, checklists and checkout time. Turnproof starts you with a sensible walk-through you can edit."
            action={
              <View style={{ gap: spacing.xs, alignSelf: 'stretch' }}>
                <PrimaryButton title="Add a property" icon={icons.add} size="lg" onPress={() => router.push('/property-editor')} />
                <PrimaryButton title="Join a host's property with a code" variant="ghost" onPress={() => router.push('/join')} />
                {__DEV__ ? <PrimaryButton title="Load demo data (dev)" variant="ghost" onPress={() => void seedDemoData()} /> : null}
              </View>
            }
          />
        ) : groups.length === 0 && !active ? (
          <EmptyState
            icon={icons.calendar}
            title="Nothing scheduled this week"
            body="Schedule the next turnover after a checkout. Turnproof reminds you before it starts."
            action={<PrimaryButton title="Schedule a turnover" icon={icons.add} size="lg" onPress={schedule} />}
          />
        ) : (
          <>
            {groups.map((g) => (
              <View key={g.dayKey} style={{ gap: spacing.sm }}>
                <SectionHeader title={dayLabel(g.dayKey, today)} detail={plural(g.turnovers.length, 'turnover')} />
                <ListGroup>
                  {g.turnovers.map((t) => (
                    <UpcomingRow key={t.id} turnover={t} today={today} />
                  ))}
                </ListGroup>
              </View>
            ))}
            <PrimaryButton title="Schedule a turnover" icon={icons.add} variant="secondary" onPress={schedule} />
          </>
        )}
      </Screen>
      {properties.length > 0 ? <HeaderActions actions={[{ key: 'schedule', icon: icons.add, label: 'Schedule a turnover', onPress: schedule }]} /> : null}
    </>
  );
}
