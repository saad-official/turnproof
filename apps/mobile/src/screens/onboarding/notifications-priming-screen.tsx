import { useState } from 'react';

import { PrimaryButton } from '@/components/primary-button';
import { icons } from '@/constants/icons';
import { updateSettings } from '@/data';
import { useSettings } from '@/hooks/use-settings';
import { haptics } from '@/native/haptics';
import { requestNotificationPermission } from '@/native/notifications';

import { PrimingLayout } from './priming-layout';

/** Reminder priming, then finish onboarding (`settings.onboarded`): the root guard opens Today. */
export function NotificationsPrimingScreen() {
  const { reminderLeadMinutes } = useSettings();
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    haptics.finished();
    await updateSettings({ onboarded: true });
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      await requestNotificationPermission().catch(() => null);
      await finish();
    } finally {
      setBusy(false);
    }
  };

  const lead = reminderLeadMinutes >= 60 ? `${reminderLeadMinutes / 60} h` : `${reminderLeadMinutes} min`;

  return (
    <PrimingLayout
      icon={icons.bell}
      step="Step 3 of 3"
      title="A nudge before checkout"
      body={`Turnproof reminds you ${lead} before each checkout ("Turnover at Maple St in 1 h") and shows the turnover in progress on your Lock Screen. No marketing, ever.`}
      actions={
        <>
          <PrimaryButton title="Turn on reminders" icon={icons.bell} size="lg" loading={busy} onPress={turnOn} />
          <PrimaryButton title="Not now" variant="ghost" onPress={finish} />
        </>
      }
    />
  );
}
