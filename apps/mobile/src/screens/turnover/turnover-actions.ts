// Turnover intents shared by Today, the property detail and the turnover screen itself.
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { showToast } from '@/components/toast';
import { turnoverFailureMessage } from '@/constants/messages';
import { getActiveTurnover, getProperty, startTurnover } from '@/data';
import { haptics } from '@/native/haptics';

const open = (id: string) => router.push({ pathname: '/turnover/[id]', params: { id } });

/**
 * Starts a scheduled turnover and opens the camera-first flow (`stay`: the caller already shows
 * this turnover and swaps to the flow by itself). One turnover runs per device: if another is
 * running, offer to continue that one instead.
 */
export async function startAndOpen(id: string, opts: { stay?: boolean } = {}): Promise<void> {
  const active = getActiveTurnover();
  if (active && active.id !== id) {
    const name = getProperty(active.propertyId)?.name ?? 'another property';
    haptics.warning();
    Alert.alert('A turnover is already running', `Finish or abandon the turnover at ${name} before starting another.`, [
      { text: 'Not now', style: 'cancel' },
      { text: `Continue ${name}`, onPress: () => open(active.id) },
    ]);
    return;
  }
  const r = await startTurnover(id);
  if (!r.ok) {
    if (r.reason === 'not-scheduled') {
      if (!opts.stay) open(id);
      return;
    }
    haptics.error();
    showToast({ message: turnoverFailureMessage(r.reason) });
    return;
  }
  haptics.started();
  if (!opts.stay) open(id);
}
