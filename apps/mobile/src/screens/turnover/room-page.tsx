import type { Room } from '@turnproof/shared';
import { router } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ChecklistRow } from '@/components/checklist-row';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-row';
import { PhotoRow } from '@/components/photo-row';
import { SectionHeader } from '@/components/section-header';
import { severityLabel } from '@/components/severity-picker';
import { StatePill } from '@/components/state-pill';
import { showToast } from '@/components/toast';
import { icons, roomIcons } from '@/constants/icons';
import { turnoverFailureMessage } from '@/constants/messages';
import { deleteIssue, toggleItem, type LocalPhoto, type TurnoverView } from '@/data';
import { useIssues } from '@/hooks/use-issues';
import { usePhotos } from '@/hooks/use-photos';
import { haptics } from '@/native/haptics';
import { spacing, useTheme } from '@/theme';

type Phase = 'before' | 'after';

function openCapture(turnoverId: string, roomId: string, phase: Phase) {
  router.push({ pathname: '/capture', params: { turnoverId, roomId, phase } });
}

function openPhoto(photo: LocalPhoto) {
  router.push({ pathname: '/photo/[id]', params: { id: photo.id, turnoverId: photo.turnoverId } });
}

/**
 * One room of the running turnover: Before photos, the checklist (large toggles), After photos,
 * any reference shots and the room's issues. Scrolls vertically inside the horizontal room pager.
 */
export function RoomPage({
  turnover,
  room,
  index,
  total,
  width,
  stampGps,
  bottomInset,
}: {
  turnover: TurnoverView;
  room: Room;
  index: number;
  total: number;
  width: number;
  stampGps: boolean;
  bottomInset: number;
}) {
  const { colors } = useTheme();
  const photos = usePhotos(turnover.id, room.id);
  const issues = useIssues(turnover.id, room.id);
  const state = turnover.roomStates.find((s) => s.roomId === room.id);
  const progress = turnover.rooms[index];
  const checked = new Set(state?.checked ?? []);
  const before = photos.filter((p) => p.phase === 'before');
  const after = photos.filter((p) => p.phase === 'after');
  const references = photos.filter((p) => p.phase === 'reference');

  const toggle = async (itemId: string) => {
    haptics.toggle();
    const r = await toggleItem(turnover.id, room.id, itemId);
    if (!r.ok) showToast({ message: turnoverFailureMessage(r.reason) });
    else if (r.events.some((e) => e.type === 'room-reopened')) showToast({ message: `${room.name} reopened` });
  };

  const issueOptions = (issueId: string) => {
    Alert.alert('Issue', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete issue',
        style: 'destructive',
        onPress: () => {
          void deleteIssue(issueId);
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: bottomInset + spacing.lg, gap: spacing.lg }}
      accessibilityLabel={`${room.name}, room ${index + 1} of ${total}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Icon name={roomIcons[room.kind]} size={28} color={colors.accentText} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title" accessibilityRole="header" numberOfLines={2}>
            {room.name}
          </AppText>
          <AppText variant="callout" tone="secondary">
            {`Room ${index + 1} of ${total}`}
          </AppText>
        </View>
        {progress?.doneAt ? <StatePill kind="done" /> : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionHeader title="Before" detail="How you found it" inset={false} />
        <PhotoRow
          photos={before}
          turnover={turnover}
          stampGps={stampGps}
          addLabel="Add before photo"
          onAdd={() => openCapture(turnover.id, room.id, 'before')}
          onPressPhoto={openPhoto}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionHeader
          title="Checklist"
          detail={
            progress
              ? `${progress.checkedRequired} of ${progress.totalRequired} required done${progress.totalAll > progress.totalRequired ? ` · ${progress.totalAll - progress.totalRequired} optional` : ''}`
              : undefined
          }
          inset={false}
        />
        {room.items.length > 0 ? (
          <ListGroup>
            {room.items.map((item) => (
              <ChecklistRow key={item.id} label={item.label} required={item.required} checked={checked.has(item.id)} onToggle={() => toggle(item.id)} />
            ))}
          </ListGroup>
        ) : (
          <AppText variant="callout" tone="tertiary">
            No checklist for this room. Edit the property to add items.
          </AppText>
        )}
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionHeader title="After" detail={room.requiresAfterPhoto ? 'Required to finish the room' : 'Optional'} inset={false} />
        <PhotoRow
          photos={after}
          turnover={turnover}
          stampGps={stampGps}
          addLabel="Add after photo"
          required={progress?.needsAfterPhoto}
          onAdd={() => openCapture(turnover.id, room.id, 'after')}
          onPressPhoto={openPhoto}
        />
      </View>

      {references.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="Reference photos" detail="From your library · never counted as proof" inset={false} />
          <PhotoRow photos={references} stampGps={stampGps} onPressPhoto={openPhoto} />
        </View>
      ) : null}

      {issues.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="Issues" inset={false} />
          <ListGroup>
            {issues.map((issue) => (
              <ListRow
                key={issue.id}
                tone="issue"
                icon={icons.issue}
                title={severityLabel(issue.severity)}
                subtitle={issue.note || (issue.photoId ? 'Photo attached' : undefined)}
                onPress={() => issueOptions(issue.id)}
                accessibilityHint="Shows options for this issue"
              />
            ))}
          </ListGroup>
        </View>
      ) : null}
    </ScrollView>
  );
}
