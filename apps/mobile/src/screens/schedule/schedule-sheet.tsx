import { dayKeyOf, zonedInstant } from '@turnproof/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AppText } from '@/components/app-text';
import { ChoiceChips, Field, TimeField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { showToast } from '@/components/toast';
import { dateTimeLabel, dayLabel, formatHhmm, upcomingDays } from '@/constants/format';
import { icons } from '@/constants/icons';
import { turnoverFailureMessage } from '@/constants/messages';
import { deviceTimeZone, rescheduleTurnover, scheduleTurnover, todayKey } from '@/data';
import { useProperties } from '@/hooks/use-properties';
import { useTurnover } from '@/hooks/use-turnovers';
import { haptics } from '@/native/haptics';

const DAYS = 14;

/**
 * `schedule?propertyId` (new) or `schedule?turnoverId` (reschedule): property, day and time
 * (the property's checkout time unless changed for this turnover).
 */
export function ScheduleSheet() {
  const params = useLocalSearchParams<{ propertyId?: string; turnoverId?: string }>();
  const existing = useTurnover(params.turnoverId);
  const properties = useProperties();
  const tz = deviceTimeZone();
  const today = todayKey(tz);
  const days = upcomingDays(DAYS, today);
  const [propertyId, setPropertyId] = useState<string | null>(
    existing?.propertyId ?? params.propertyId ?? (properties.length === 1 ? properties[0]!.id : null),
  );
  const property = properties.find((p) => p.id === propertyId) ?? null;
  const [day, setDay] = useState<string>(() => {
    if (existing) {
      const key = dayKeyOf(existing.scheduledFor, tz);
      return days.includes(key) ? key : today;
    }
    return today;
  });
  const [time, setTime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const effectiveTime = time ?? property?.checkoutTime ?? '11:00';

  if (properties.length === 0) {
    return (
      <FormSheet title="Schedule a turnover">
        <EmptyState
          icon={icons.properties}
          title="Add a property first"
          body="Turnovers belong to a property: its rooms, checklists and checkout time."
          action={
            <PrimaryButton
              title="Add a property"
              icon={icons.add}
              onPress={() => {
                router.back();
                router.push('/property-editor');
              }}
            />
          }
        />
      </FormSheet>
    );
  }

  const save = async () => {
    if (!property) {
      haptics.warning();
      setError('Pick a property.');
      return;
    }
    setBusy(true);
    setError(null);
    // The property's own checkout time goes as a day key (the data layer resolves it DST-safely).
    const when = time === null || time === property.checkoutTime ? day : new Date(zonedInstant(day, effectiveTime, tz)).toISOString();
    try {
      if (existing) {
        const r = await rescheduleTurnover(existing.id, when);
        if (!r.ok) {
          setError(turnoverFailureMessage(r.reason));
          return;
        }
        showToast({ message: `Moved to ${dateTimeLabel(r.turnover.scheduledFor)}` });
      } else {
        const t = await scheduleTurnover(property.id, when);
        showToast({ message: `${property.name}: ${dateTimeLabel(t.scheduledFor)}` });
      }
      haptics.selection();
      router.back();
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : 'Could not schedule the turnover.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      title={existing ? 'Reschedule' : 'Schedule a turnover'}
      footer={<PrimaryButton title={existing ? 'Move turnover' : 'Schedule'} icon={icons.calendar} size="lg" loading={busy} onPress={save} />}
    >
      {!existing ? (
        <Field label="Property">
          <ChoiceChips
            accessibilityLabel="Property"
            options={properties.map((p) => ({ value: p.id, label: p.name }))}
            isSelected={(v) => v === propertyId}
            onToggle={(v) => {
              setPropertyId(v);
              setTime(null);
              setError(null);
            }}
          />
        </Field>
      ) : (
        <AppText variant="headline">{property?.name}</AppText>
      )}
      <Field label="Day">
        <ChoiceChips
          accessibilityLabel="Day"
          options={days.map((d) => ({ value: d, label: dayLabel(d, today) }))}
          isSelected={(v) => v === day}
          onToggle={setDay}
        />
      </Field>
      <Field
        label="Checkout time"
        hint={property ? `${property.name} checks out at ${formatHhmm(property.checkoutTime)}. Change it here for this turnover only.` : undefined}
      >
        <TimeField label="Checkout time" value={effectiveTime} onChange={setTime} />
      </Field>
      {error ? (
        <AppText variant="callout" tone="issue" selectable>
          {error}
        </AppText>
      ) : null}
    </FormSheet>
  );
}
