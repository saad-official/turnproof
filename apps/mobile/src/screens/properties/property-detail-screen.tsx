import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CountdownLabel } from '@/components/countdown-label';
import { EmptyState } from '@/components/empty-state';
import { HeaderActions } from '@/components/header-actions';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SectionHeader } from '@/components/section-header';
import { ShareCodeCard } from '@/components/share-code-card';
import { SkeletonList } from '@/components/skeleton';
import { showToast } from '@/components/toast';
import { dateLabel, formatHhmm, plural } from '@/constants/format';
import { icons, roomIcons } from '@/constants/icons';
import { propertyErrorMessage } from '@/constants/messages';
import { deleteProperty, leaveProperty, removePropertyMember, rotateInviteCode, shareProperty } from '@/data';
import { useProperty } from '@/hooks/use-properties';
import { usePropertyMembers } from '@/hooks/use-property-members';
import { useSession } from '@/hooks/use-session';
import { useUpcomingTurnovers } from '@/hooks/use-turnovers';
import { haptics } from '@/native/haptics';
import { spacing, useTheme } from '@/theme';

async function shareCode(name: string, code: string) {
  await Share.share({
    message: `Join ${name} on Turnproof: open Properties → Join with a code and enter ${code}`,
    title: 'Turnproof invite code',
  }).catch(() => undefined);
}

/** Property detail: details, upcoming turnovers, rooms, supplies, sharing and members, delete. */
export function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const property = useProperty(id);
  const { data: session } = useSession();
  const shared = usePropertyMembers(id);
  const upcoming = useUpcomingTurnovers(14).filter((t) => t.propertyId === id && t.status === 'scheduled');
  const [sharing, setSharing] = useState(false);
  const [rotating, setRotating] = useState(false);

  if (!property || property.deletedAt) {
    return (
      <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <Stack.Screen options={{ title: 'Property' }} />
        <EmptyState icon={icons.properties} title="Property not found" body="It was deleted or is no longer shared with you." />
      </Screen>
    );
  }

  const isCleaner = shared.role === 'cleaner';
  const inviteCode = shared.inviteCode ?? property.inviteCode ?? null;
  const edit = () => router.push({ pathname: '/property-editor', params: { id: property.id } });

  const startSharing = async () => {
    if (!session) {
      router.push('/account');
      return;
    }
    setSharing(true);
    try {
      const view = await shareProperty(property.id);
      if (view.inviteCode) await shareCode(property.name, view.inviteCode);
    } catch (e) {
      haptics.error();
      showToast({ message: propertyErrorMessage(e, 'Could not share the property.') });
    } finally {
      setSharing(false);
    }
  };

  const rotate = () => {
    Alert.alert('Make a new code?', 'The old code stops working. People who already joined stay members.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'New code',
        onPress: async () => {
          setRotating(true);
          try {
            await rotateInviteCode(property.id);
          } catch (e) {
            showToast({ message: propertyErrorMessage(e, 'Could not make a new code.') });
          } finally {
            setRotating(false);
          }
        },
      },
    ]);
  };

  const removeMember = (userId: string, name: string) => {
    haptics.warning();
    Alert.alert(`Remove ${name}?`, 'They stop seeing this property and its schedule.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removePropertyMember(property.id, userId)
            .then(() => shared.refresh())
            .catch((e: unknown) => showToast({ message: propertyErrorMessage(e, 'Could not remove them.') }));
        },
      },
    ]);
  };

  const leave = () => {
    haptics.warning();
    Alert.alert(`Leave ${property.name}?`, 'It is removed from this phone. Your finished turnovers stay with the host.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          const r = await leaveProperty(property.id);
          if (r.ok) {
            router.back();
            return;
          }
          if (r.reason === 'pending-uploads') {
            Alert.alert('Photos still uploading', 'Some photos from this property have not uploaded yet. Leave anyway and lose them?', [
              { text: 'Wait', style: 'cancel' },
              {
                text: 'Leave anyway',
                style: 'destructive',
                onPress: async () => {
                  const forced = await leaveProperty(property.id, { force: true });
                  if (forced.ok) router.back();
                },
              },
            ]);
          } else showToast({ message: r.message ?? 'Could not leave the property.' });
        },
      },
    ]);
  };

  const confirmDelete = () => {
    haptics.warning();
    Alert.alert(`Delete ${property.name}?`, 'Its scheduled turnovers are removed. Finished turnovers stay in History.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteProperty(property.id);
          showToast({ message: `${property.name} deleted` });
          router.back();
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: property.name }} />
      <Screen>
        <ListGroup>
          {property.address ? <ListRow icon={icons.pin} title={property.address} selectable /> : null}
          <ListRow icon={icons.door} title="Checkout" value={formatHhmm(property.checkoutTime)} />
          <ListRow icon={icons.key} title="Next check-in" value={formatHhmm(property.checkinTime)} />
          {property.accessNotes ? <ListRow icon={icons.note} title="Access notes" subtitle={property.accessNotes} selectable /> : null}
        </ListGroup>

        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="Upcoming" detail={upcoming.length ? plural(upcoming.length, 'turnover') : undefined} />
          {upcoming.length > 0 ? (
            <ListGroup>
              {upcoming.map((t) => (
                <ListRow
                  key={t.id}
                  title={dateLabel(t.scheduledFor)}
                  detail={<CountdownLabel scheduledFor={t.scheduledFor} countdown={t.countdown} overdue={t.overdue} />}
                  onPress={() => router.push({ pathname: '/turnover/[id]', params: { id: t.id } })}
                />
              ))}
            </ListGroup>
          ) : null}
          <PrimaryButton
            title="Schedule a turnover"
            icon={icons.calendar}
            variant="secondary"
            onPress={() => router.push({ pathname: '/schedule', params: { propertyId: property.id } })}
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="Rooms" detail={plural(property.rooms.length, 'room')} />
          <ListGroup>
            {property.rooms.map((r) => (
              <ListRow
                key={r.id}
                leading={<Icon name={roomIcons[r.kind]} size={22} color={colors.accentText} />}
                title={r.name}
                subtitle={`${r.items.filter((i) => i.required).length} required · ${r.items.filter((i) => !i.required).length} optional${r.requiresAfterPhoto ? ' · after photo' : ''}`}
              />
            ))}
            {!isCleaner ? <ListRow icon={icons.edit} title="Edit rooms and checklists" tone="accent" onPress={edit} /> : null}
          </ListGroup>
        </View>

        {property.supplies.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Supplies to restock" />
            <ListGroup>
              <ListRow icon={icons.supplies} title={property.supplies.join(', ')} />
            </ListGroup>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <SectionHeader title={isCleaner ? 'Shared with you' : 'Share with your cleaner'} />
          {isCleaner ? (
            <AppText variant="callout" tone="secondary" style={{ paddingHorizontal: spacing.md }}>
              Your host shares this property with you. Your turnovers here appear on their phone.
            </AppText>
          ) : !session ? (
            <ListGroup footer="Sharing needs an account so both of you see the same schedule.">
              <ListRow icon={icons.account} title="Sign in to share" onPress={() => router.push('/account')} />
            </ListGroup>
          ) : inviteCode ? (
            <ShareCodeCard code={inviteCode} onShare={() => shareCode(property.name, inviteCode)} onRotate={rotate} rotating={rotating} />
          ) : (
            <PrimaryButton title="Share with a cleaner" icon={icons.personAdd} loading={sharing} onPress={startSharing} />
          )}
          {shared.loading && shared.members.length === 0 && (inviteCode || isCleaner) ? <SkeletonList rows={2} /> : null}
          {shared.members.length > 0 ? (
            <ListGroup>
              {shared.members.map((m) => (
                <ListRow
                  key={m.userId}
                  icon={m.role === 'host' ? icons.properties : icons.sparkles}
                  title={m.isMe ? `${m.name} (you)` : m.name}
                  subtitle={`${m.role === 'host' ? 'Host' : 'Cleaner'} · joined ${dateLabel(m.joinedAt)}`}
                  onPress={!isCleaner && !m.isMe ? () => removeMember(m.userId, m.name) : undefined}
                  accessibilityHint={!isCleaner && !m.isMe ? 'Removes this person from the property' : undefined}
                  chevron={false}
                />
              ))}
            </ListGroup>
          ) : null}
          {shared.error && (inviteCode || isCleaner) ? (
            <AppText variant="caption" tone="secondary" style={{ paddingHorizontal: spacing.md }}>
              Members could not be refreshed. Showing the last known list.
            </AppText>
          ) : null}
        </View>

        {isCleaner ? (
          <PrimaryButton title="Leave property" icon={icons.logout} variant="destructive" onPress={leave} />
        ) : (
          <PrimaryButton title="Delete property" icon={icons.trash} variant="destructive" onPress={confirmDelete} />
        )}
      </Screen>
      {!isCleaner ? <HeaderActions actions={[{ key: 'edit', icon: icons.edit, label: 'Edit property', onPress: edit }]} /> : null}
    </>
  );
}
