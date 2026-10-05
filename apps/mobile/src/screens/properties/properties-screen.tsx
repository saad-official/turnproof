import { addDaysToKey } from '@turnproof/shared';
import { router } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { HeaderActions } from '@/components/header-actions';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { StatePill } from '@/components/state-pill';
import { dateTimeLabel, plural } from '@/constants/format';
import { icons } from '@/constants/icons';
import { dayBounds, deviceTimeZone, useToday } from '@/data';
import { useProperties } from '@/hooks/use-properties';
import { useSettings } from '@/hooks/use-settings';
import { useTurnoverSummaries } from '@/hooks/use-turnovers';
import { spacing, useTheme } from '@/theme';

/** Properties: name, rooms and the next turnover; add one or join a host's with a code. */
export function PropertiesScreen() {
  const { colors } = useTheme();
  const properties = useProperties();
  const today = useToday();
  const tz = deviceTimeZone();
  // Today (overdue ones included) … 14 days ahead, by time: the first scheduled one is the next.
  const summaries = useTurnoverSummaries({ from: dayBounds(today, tz).start, to: dayBounds(addDaysToKey(today, 14), tz).start });
  const { role } = useSettings();
  const nextTurnover = new Map<string, string>();
  for (const s of summaries) {
    if (s.turnover.status === 'scheduled' && !nextTurnover.has(s.turnover.propertyId)) nextTurnover.set(s.turnover.propertyId, s.turnover.scheduledFor);
  }
  const add = () => router.push('/property-editor');
  const join = () => router.push('/join');

  return (
    <>
      <Screen>
        {properties.length === 0 ? (
          <EmptyState
            icon={icons.properties}
            title="No properties yet"
            body={
              role === 'cleaner'
                ? "Join your host's property with their invite code, or add one yourself."
                : 'Add a property with its rooms, checklists and checkout time.'
            }
            action={
              <View style={{ gap: spacing.xs, alignSelf: 'stretch' }}>
                <PrimaryButton title="New property" icon={icons.add} size="lg" onPress={add} />
                <PrimaryButton title="Join with a code" icon={icons.personAdd} variant="secondary" onPress={join} />
              </View>
            }
          />
        ) : (
          <>
            <ListGroup>
              {properties.map((p) => {
                const at = nextTurnover.get(p.id);
                return (
                  <ListRow
                    key={p.id}
                    leading={<Icon name={icons.properties} size={22} color={colors.accentText} />}
                    title={p.name}
                    subtitle={`${plural(p.rooms.length, 'room')} · ${at ? `Next ${dateTimeLabel(at)}` : 'Nothing scheduled'}`}
                    detail={p.inviteCode ? <StatePill kind="shared" /> : undefined}
                    onPress={() => router.push({ pathname: '/properties/[id]', params: { id: p.id } })}
                  />
                );
              })}
            </ListGroup>
            <ListGroup footer="A host shares a property with an invite code; you'll both see its schedule and turnovers.">
              <ListRow icon={icons.personAdd} title="Join with a code" onPress={join} />
            </ListGroup>
          </>
        )}
      </Screen>
      <HeaderActions actions={[{ key: 'add', icon: icons.add, label: 'New property', onPress: add }]} />
    </>
  );
}
