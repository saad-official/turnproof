import { DEFAULT_ROOM_KINDS, DEFAULT_SUPPLIES, type Room } from '@turnproof/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Field, PlainInput, TextField, TimeField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { RoomEditor } from '@/components/room-editor';
import { showToast } from '@/components/toast';
import { icons } from '@/constants/icons';
import { createProperty, newRoom, updateProperty } from '@/data';
import { useProperty } from '@/hooks/use-properties';
import { haptics } from '@/native/haptics';
import { CHROME_FONT_CAP, radius, spacing, touchTarget, useTheme } from '@/theme';

function SuppliesEditor({ supplies, onChange }: { supplies: string[]; onChange: (s: string[]) => void }) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || supplies.includes(v)) return;
    onChange([...supplies, v]);
    setDraft('');
  };
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {supplies.map((s) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${s}`}
            onPress={() => {
              haptics.selection();
              onChange(supplies.filter((x) => x !== s));
            }}
            style={({ pressed }) => ({
              minHeight: touchTarget - spacing.xxs,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xxs,
              paddingStart: spacing.sm,
              paddingEnd: spacing.xs,
              borderRadius: radius.pill,
              backgroundColor: pressed ? colors.border : colors.surfaceSunken,
            })}
          >
            <AppText variant="callout" maxFontSizeMultiplier={CHROME_FONT_CAP}>
              {s}
            </AppText>
            <Icon name={icons.close} size={12} color={colors.textSecondary} weight="bold" />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <PlainInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a supply"
          accessibilityLabel="Add a supply"
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={add}
          style={{ flex: 1 }}
        />
        <IconButton icon={icons.add} label="Add supply" variant="tinted" disabled={!draft.trim()} onPress={add} />
      </View>
    </View>
  );
}

/**
 * `property-editor?id`: new or edit. Name, address, checkout / check-in times, the walk-through
 * (rooms from templates, reorder, per-room checklist), supplies and access notes.
 */
export function PropertyEditorSheet() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useProperty(id);
  const editing = !!existing;
  const [name, setName] = useState(existing?.name ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [checkout, setCheckout] = useState(existing?.checkoutTime ?? '11:00');
  const [checkin, setCheckin] = useState(existing?.checkinTime ?? '16:00');
  const [notes, setNotes] = useState(existing?.accessNotes ?? '');
  const [rooms, setRooms] = useState<Room[]>(() => existing?.rooms ?? DEFAULT_ROOM_KINDS.map((k) => newRoom(k)));
  const [supplies, setSupplies] = useState<string[]>(() => existing?.supplies ?? [...DEFAULT_SUPPLIES]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      haptics.warning();
      setNameError('Give the property a name, e.g. "Maple St".');
      return;
    }
    if (rooms.some((r) => !r.name.trim())) {
      haptics.warning();
      setError('Every room needs a name.');
      return;
    }
    setSaving(true);
    setError(null);
    const cleanRooms = rooms.map((r) => ({ ...r, name: r.name.trim() }));
    try {
      if (existing) {
        await updateProperty(existing.id, {
          name: name.trim(),
          address: address.trim() || null,
          checkoutTime: checkout,
          checkinTime: checkin,
          accessNotes: notes.trim() || null,
          rooms: cleanRooms,
          supplies,
        });
        showToast({ message: 'Property saved' });
      } else {
        await createProperty({
          name: name.trim(),
          address: address.trim() || null,
          checkoutTime: checkout,
          checkinTime: checkin,
          accessNotes: notes.trim() || null,
          rooms: cleanRooms,
          supplies,
        });
        showToast({ message: `${name.trim()} added` });
      }
      haptics.selection();
      router.back();
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : 'Could not save the property.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet title={editing ? 'Edit property' : 'New property'} primaryLabel="Save" onPrimary={save} busy={saving}>
      <TextField
        label="Name"
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (nameError) setNameError(null);
        }}
        placeholder="Maple St"
        maxLength={80}
        autoCapitalize="words"
        error={nameError}
      />
      <TextField label="Address (optional)" value={address} onChangeText={setAddress} placeholder="12 Maple St, Toronto" maxLength={200} hint="Only shown on your devices, never on the public proof page." />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Checkout">
            <TimeField label="Checkout time" value={checkout} onChange={setCheckout} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Next check-in">
            <TimeField label="Check-in time" value={checkin} onChange={setCheckin} />
          </Field>
        </View>
      </View>
      <Field label="Rooms and checklists" hint="In the order you walk through them. Tap a room to edit its checklist.">
        <RoomEditor rooms={rooms} onChange={setRooms} />
      </Field>
      <Field label="Supplies to restock">
        <SuppliesEditor supplies={supplies} onChange={setSupplies} />
      </Field>
      <TextField
        label="Access notes (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Lockbox code, parking, Wi-Fi…"
        multiline
        maxLength={2000}
        hint="Shown at the start of each turnover. Never on the proof page."
      />
      {error ? (
        <AppText variant="callout" tone="issue" selectable>
          {error}
        </AppText>
      ) : null}
    </FormSheet>
  );
}
