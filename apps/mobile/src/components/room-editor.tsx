import { ROOM_KINDS, ROOM_TEMPLATES, type Room, type RoomKind } from '@turnproof/shared';
import { Fragment, useState } from 'react';
import { Pressable, View } from 'react-native';

import { icons, roomIcons } from '@/constants/icons';
import { newChecklistItem, newRoom } from '@/data';
import { haptics } from '@/native/haptics';
import { CHROME_FONT_CAP, hairline, radius, spacing, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';
import { ChoiceChips, Field, PlainInput } from './form-fields';
import { Icon } from './icon';
import { IconButton } from './icon-button';
import { ToggleRow } from './toggle-row';

function nextRoomName(rooms: Room[], kind: RoomKind): string {
  const base = ROOM_TEMPLATES[kind].name;
  const same = rooms.filter((r) => r.kind === kind).length;
  return same === 0 ? base : `${base} ${same + 1}`;
}

function RoomItems({ room, onChange }: { room: Room; onChange: (room: Room) => void }) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const add = () => {
    const label = draft.trim();
    if (!label) return;
    onChange({ ...room, items: [...room.items, newChecklistItem(label)] });
    setDraft('');
  };
  return (
    <View style={{ gap: spacing.xs }}>
      {room.items.map((item) => (
        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: touchTarget }}>
          <AppText variant="body" style={{ flex: 1 }}>
            {item.label}
          </AppText>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={`${item.label} required`}
            accessibilityState={{ checked: item.required }}
            onPress={() => {
              haptics.selection();
              onChange({ ...room, items: room.items.map((i) => (i.id === item.id ? { ...i, required: !i.required } : i)) });
            }}
            hitSlop={spacing.xxs}
            style={({ pressed }) => ({
              minHeight: touchTarget - spacing.xs,
              paddingHorizontal: spacing.sm,
              borderRadius: radius.pill,
              justifyContent: 'center',
              backgroundColor: item.required ? colors.accentSoft : pressed ? colors.border : colors.surfaceSunken,
            })}
          >
            <AppText variant="caption" weight="600" tone={item.required ? 'accent' : 'secondary'} maxFontSizeMultiplier={CHROME_FONT_CAP}>
              {item.required ? 'Required' : 'Optional'}
            </AppText>
          </Pressable>
          <IconButton
            icon={icons.minus}
            label={`Remove ${item.label}`}
            variant="issue"
            size={32}
            onPress={() => onChange({ ...room, items: room.items.filter((i) => i.id !== item.id) })}
          />
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <PlainInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a checklist item"
          accessibilityLabel={`Add a checklist item to ${room.name}`}
          returnKeyType="done"
          onSubmitEditing={add}
          submitBehavior="submit"
          style={{ flex: 1 }}
        />
        <IconButton icon={icons.add} label="Add item" variant="tinted" onPress={add} disabled={!draft.trim()} />
      </View>
    </View>
  );
}

/**
 * The walk-through editor: rooms in order (move up / down, remove), each expanding into its name,
 * after-photo rule and checklist (add, remove, required / optional). New rooms come from the shared
 * templates. Controlled: the caller saves.
 */
export function RoomEditor({ rooms, onChange }: { rooms: Room[]; onChange: (rooms: Room[]) => void }) {
  const { colors, shadow } = useTheme();
  const [open, setOpen] = useState<string | null>(null);

  const update = (room: Room) => onChange(rooms.map((r) => (r.id === room.id ? room : r)));
  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= rooms.length) return;
    const next = [...rooms];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved!);
    haptics.selection();
    onChange(next);
  };
  const add = (kind: RoomKind) => {
    const room = newRoom(kind, nextRoomName(rooms, kind));
    onChange([...rooms, room]);
    setOpen(room.id);
  };

  return (
    <View style={{ gap: spacing.md }}>
      {rooms.length > 0 ? (
        <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderCurve: 'continuous', boxShadow: shadow('sm') }}>
          {rooms.map((room, index) => {
            const expanded = open === room.id;
            const required = room.items.filter((i) => i.required).length;
            return (
              <Fragment key={room.id}>
                {index > 0 ? <View style={{ height: hairline, backgroundColor: colors.separator, marginStart: spacing.md }} /> : null}
                <View style={{ paddingVertical: spacing.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingStart: spacing.md, paddingEnd: spacing.xs }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${room.name}, ${room.items.length} items`}
                      accessibilityHint={expanded ? 'Collapses the checklist' : 'Edits the checklist'}
                      accessibilityState={{ expanded }}
                      onPress={() => setOpen(expanded ? null : room.id)}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget }}
                    >
                      <Icon name={roomIcons[room.kind]} size={22} color={colors.accentText} />
                      <View style={{ flex: 1 }}>
                        <AppText variant="body" weight="600">
                          {room.name}
                        </AppText>
                        <AppText variant="caption" tone="secondary">
                          {`${required} required · ${room.items.length - required} optional${room.requiresAfterPhoto ? ' · after photo' : ''}`}
                        </AppText>
                      </View>
                      <Icon name={expanded ? icons.chevronUp : icons.chevronDown} size={14} color={colors.textTertiary} weight="semibold" />
                    </Pressable>
                    <IconButton icon={icons.arrowUp} label={`Move ${room.name} up`} size={36} disabled={index === 0} onPress={() => move(index, -1)} />
                    <IconButton
                      icon={icons.arrowDown}
                      label={`Move ${room.name} down`}
                      size={36}
                      disabled={index === rooms.length - 1}
                      onPress={() => move(index, 1)}
                    />
                  </View>
                  {expanded ? (
                    <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.md }}>
                      <Field label="Room name">
                        <PlainInput
                          value={room.name}
                          onChangeText={(name) => update({ ...room, name })}
                          accessibilityLabel="Room name"
                          maxLength={60}
                        />
                      </Field>
                      <View style={{ marginHorizontal: -spacing.md }}>
                        <ToggleRow
                          title="Needs an after photo"
                          subtitle="The room is only done once an after photo is taken."
                          value={room.requiresAfterPhoto}
                          onValueChange={(requiresAfterPhoto) => update({ ...room, requiresAfterPhoto })}
                        />
                      </View>
                      <Field label="Checklist">
                        <RoomItems room={room} onChange={update} />
                      </Field>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${room.name}`}
                        onPress={() => {
                          haptics.warning();
                          onChange(rooms.filter((r) => r.id !== room.id));
                          setOpen(null);
                        }}
                        style={({ pressed }) => ({ minHeight: touchTarget, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
                      >
                        <AppText variant="body" tone="issue" weight="600">
                          Remove room
                        </AppText>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </Fragment>
            );
          })}
        </View>
      ) : (
        <AppText variant="callout" tone="secondary">
          No rooms yet. Add the rooms in the order you walk through them.
        </AppText>
      )}
      <Field label="Add a room">
        <ChoiceChips
          accessibilityLabel="Add a room"
          options={ROOM_KINDS.map((k) => ({ value: k, label: ROOM_TEMPLATES[k].name }))}
          isSelected={() => false}
          onToggle={add}
          multi
        />
      </Field>
    </View>
  );
}
