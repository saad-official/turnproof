import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { plural } from '@/constants/format';
import { roomIcons } from '@/constants/icons';
import { turnoverFailureMessage } from '@/constants/messages';
import { finishTurnover, goToRoom } from '@/data';
import { useTurnover } from '@/hooks/use-turnovers';
import { haptics } from '@/native/haptics';
import { spacing, useTheme } from '@/theme';

function missing(r: { totalRequired: number; checkedRequired: number; needsAfterPhoto: boolean }): string {
  const left = r.totalRequired - r.checkedRequired;
  return [left > 0 ? plural(left, 'required item') : null, r.needsAfterPhoto ? 'after photo' : null].filter(Boolean).join(' · ') || 'Not marked done';
}

/**
 * `finish?id=`: Finish was pressed with rooms still open. Lists them (tap to go back to a room) and
 * offers "Finish anyway" with a required note, recorded on the turnover (`forced`).
 */
export function FinishSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const turnover = useTurnover(id);
  const { colors } = useTheme();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = turnover?.rooms.filter((r) => !r.complete) ?? [];
  const kinds = new Map(turnover?.property?.rooms.map((r) => [r.id, r.kind]) ?? []);

  const finishAnyway = async () => {
    if (!turnover) return;
    if (!note.trim()) {
      haptics.warning();
      setError('Add a short note for the host, e.g. "Guest still checking out of bedroom 2".');
      return;
    }
    setBusy(true);
    try {
      const r = await finishTurnover(turnover.id, { force: true, note: note.trim() });
      if (!r.ok) {
        haptics.error();
        setError(turnoverFailureMessage(r.reason));
        return;
      }
      haptics.finished();
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      title="Rooms not done"
      leadingLabel="Keep working"
      footer={
        <>
          <PrimaryButton title="Finish anyway" size="lg" variant="secondary" loading={busy} onPress={finishAnyway} />
          <PrimaryButton title="Keep working" variant="ghost" onPress={() => router.back()} />
        </>
      }
    >
      <AppText variant="body" tone="secondary">
        {open.length > 0
          ? `${plural(open.length, 'room')} still ${open.length === 1 ? 'needs' : 'need'} work. Go back to a room, or finish now and explain why.`
          : 'Every room is done now. You can finish normally.'}
      </AppText>
      {open.length > 0 ? (
        <ListGroup>
          {open.map((r) => (
            <ListRow
              key={r.roomId}
              leading={<Icon name={roomIcons[kinds.get(r.roomId) ?? 'other']} size={22} color={colors.accentText} />}
              title={r.name}
              subtitle={missing(r)}
              accessibilityHint="Goes back to this room"
              onPress={() => {
                if (turnover) void goToRoom(turnover.id, r.index);
                router.back();
              }}
            />
          ))}
        </ListGroup>
      ) : null}
      <View style={{ gap: spacing.xs }}>
        <TextField
          label="Note for the host (required to finish early)"
          value={note}
          onChangeText={(v) => {
            setNote(v);
            if (error) setError(null);
          }}
          placeholder="Why were these rooms left?"
          multiline
          maxLength={2000}
          error={error}
        />
      </View>
    </FormSheet>
  );
}
