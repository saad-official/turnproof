import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { icons } from '@/constants/icons';
import { useTurnover } from '@/hooks/use-turnovers';
import { spacing, useTheme } from '@/theme';

import { TurnoverSummary } from '../summary/summary-screen';
import { StartView } from './start-view';
import { TurnoverFlow } from './turnover-flow';

/**
 * `turnover/[id]` (also `turnproof://turnover/<id>[?issue=1]`): scheduled → details with Start;
 * running → the camera-first room flow; finished or abandoned → the summary. The content swaps in
 * place as the status changes, so finishing never fights a navigation transition.
 */
export function TurnoverScreen() {
  const { id, issue } = useLocalSearchParams<{ id: string; issue?: string }>();
  const turnover = useTurnover(id);
  const { colors } = useTheme();

  if (!turnover) {
    return (
      <>
        <Stack.Screen options={{ title: 'Turnover' }} />
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={{ flex: 1, backgroundColor: colors.surface }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.lg }}
        >
          <EmptyState
            icon={icons.calendar}
            title="This turnover is gone"
            body="It was deleted, or it belongs to a property you no longer share."
            action={<PrimaryButton title="Back to Today" block={false} style={{ alignSelf: 'center' }} onPress={() => router.dismissTo('/today')} />}
          />
        </ScrollView>
      </>
    );
  }
  if (turnover.status === 'scheduled') return <StartView turnover={turnover} />;
  if (turnover.status === 'in-progress') return <TurnoverFlow turnover={turnover} openIssue={issue === '1'} />;
  return <TurnoverSummary id={turnover.id} context="flow" />;
}
