import { router } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { GlassBar } from '@/components/glass-bar';
import { PrimaryButton } from '@/components/primary-button';
import { elapsedSpoken, formatElapsed } from '@/constants/format';
import { icons } from '@/constants/icons';
import { useTurnover } from '@/hooks/use-turnovers';
import { spacing } from '@/theme';

/**
 * The running turnover: property, current room, live timer, rooms done on a glass progress bar.
 * Only this card ticks every second; the rest of Today re-renders on the 30 s clock.
 */
export function ActiveTurnoverCard({ id }: { id: string }) {
  const turnover = useTurnover(id, { everySecond: true });
  if (!turnover) return null;
  const p = turnover.progress;
  const done = p?.roomsDone ?? 0;
  const total = p?.roomsTotal ?? 0;
  const room = p?.currentRoomName;
  return (
    <GlassBar
      title={turnover.property?.name ?? 'Turnover'}
      subtitle={[room ? `Now: ${room}` : null, `${done} of ${total} rooms done`].filter(Boolean).join(' · ')}
      progress={total > 0 ? done / total : 0}
      progressLabel={`${done} of ${total} rooms done`}
      trailing={
        <View accessible accessibilityLabel={`Elapsed ${elapsedSpoken(turnover.elapsedSeconds)}`} style={{ alignItems: 'flex-end' }}>
          <AppText variant="headline" tabular>
            {formatElapsed(turnover.elapsedSeconds)}
          </AppText>
          <AppText variant="caption" tone="secondary">
            elapsed
          </AppText>
        </View>
      }
    >
      <View style={{ paddingTop: spacing.xs }}>
        <PrimaryButton
          title="Continue turnover"
          icon={icons.camera}
          size="lg"
          onPress={() => router.push({ pathname: '/turnover/[id]', params: { id: turnover.id } })}
        />
      </View>
    </GlassBar>
  );
}
