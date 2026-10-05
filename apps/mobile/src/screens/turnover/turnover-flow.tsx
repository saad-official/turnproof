import type { Room } from '@turnproof/shared';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, useWindowDimensions, View } from 'react-native';
import Animated, { FadeOut, Keyframe, ReduceMotion, useAnimatedScrollHandler, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { OverflowMenu } from '@/components/overflow-menu';
import { PrimaryButton } from '@/components/primary-button';
import { RoomStepper } from '@/components/room-stepper';
import { showToast, useToastClearance } from '@/components/toast';
import { elapsedSpoken, formatElapsed, plural } from '@/constants/format';
import { icons, type IconName } from '@/constants/icons';
import { turnoverFailureMessage } from '@/constants/messages';
import { abandonTurnover, completeRoom, finishTurnover, goToRoom, type TurnoverView } from '@/data';
import { useSettings } from '@/hooks/use-settings';
import { useTurnover } from '@/hooks/use-turnovers';
import { haptics } from '@/native/haptics';
import { actionTarget, CHROME_FONT_CAP, hairline, radius, spacing, useTheme } from '@/theme';

import { RoomPage } from './room-page';

/** The room-done check: settles in from 90% (rare tier: once per room). */
const CHECK_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.9 }] },
  60: { opacity: 1, transform: [{ scale: 1.04 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
})
  .duration(320)
  .reduceMotion(ReduceMotion.System);
const CHECK_EXIT = FadeOut.duration(200).reduceMotion(ReduceMotion.System);

/** Header title: property + live elapsed timer (the only part that ticks every second). */
function FlowTitle({ id }: { id: string }) {
  const t = useTurnover(id, { everySecond: true });
  const seconds = t?.elapsedSeconds ?? 0;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={`${t?.property?.name ?? 'Turnover'}, ${elapsedSpoken(seconds)} elapsed`} style={{ alignItems: 'center' }}>
      <AppText variant="body" weight="600" numberOfLines={1} maxFontSizeMultiplier={CHROME_FONT_CAP}>
        {t?.property?.name ?? 'Turnover'}
      </AppText>
      <AppText variant="caption" tone="secondary" tabular maxFontSizeMultiplier={CHROME_FONT_CAP}>
        {`${formatElapsed(seconds)} elapsed`}
      </AppText>
    </View>
  );
}

function missingText(p: TurnoverView['rooms'][number] | undefined): string | null {
  if (!p || p.complete) return null;
  const left = p.totalRequired - p.checkedRequired;
  const parts = [left > 0 ? plural(left, 'required item') : null, p.needsAfterPhoto ? 'an after photo' : null].filter(Boolean);
  return parts.length ? `Still needed: ${parts.join(' and ')}` : null;
}

/**
 * The running turnover, camera-first: a horizontal pager of rooms (swipe, the stepper dots or the
 * arrows), each with Before photos → checklist → After photos, and a bottom-anchored action bar
 * (Issue, Room done / Next room / Finish) within thumb reach.
 */
export function TurnoverFlow({ turnover, openIssue }: { turnover: TurnoverView; openIssue: boolean }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { stampGps } = useSettings();
  const rooms = turnover.property?.rooms ?? [];
  const current = Math.min(turnover.progress?.currentRoomIndex ?? 0, Math.max(0, rooms.length - 1));
  const listRef = useRef<FlatList<Room>>(null);
  const page = useRef(current);
  const position = useSharedValue(current);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState<number | null>(null);
  // Toasts sit above the action bar (button + hint + padding).
  useToastClearance(actionTarget + spacing.xl + spacing.lg);

  const onScroll = useAnimatedScrollHandler((e) => {
    position.set(e.contentOffset.x / Math.max(1, width));
  });

  // The data moved the current room (Room done, Live Activity "Next room", a stepper tap): slide there.
  useEffect(() => {
    if (page.current === current) return;
    page.current = current;
    listRef.current?.scrollToIndex({ index: current, animated: !reduced });
  }, [current, reduced]);

  // `?issue=1` (Live Activity / notification "Issue"): open the sheet once, then clear the param.
  useEffect(() => {
    if (!openIssue) return;
    router.setParams({ issue: undefined });
    router.push({ pathname: '/issue', params: { turnoverId: turnover.id, roomId: rooms[current]?.id ?? '' } });
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIssue]);

  useEffect(() => {
    if (celebrate === null) return;
    const timer = setTimeout(() => setCelebrate(null), 900);
    return () => clearTimeout(timer);
  }, [celebrate]);

  const go = useCallback(
    (index: number) => {
      if (index < 0 || index >= rooms.length || index === current) return;
      haptics.roomChange();
      void goToRoom(turnover.id, index);
    },
    [current, rooms.length, turnover.id],
  );

  const onMomentumScrollEnd = (x: number) => {
    const index = Math.round(x / Math.max(1, width));
    page.current = index;
    go(index);
  };

  const reportIssue = () =>
    router.push({ pathname: '/issue', params: { turnoverId: turnover.id, roomId: rooms[current]?.id ?? '' } });

  const finish = async () => {
    setBusy(true);
    try {
      const r = await finishTurnover(turnover.id);
      if (r.ok) {
        haptics.finished();
        return; // the screen swaps to the summary
      }
      if (r.reason === 'rooms-incomplete') {
        haptics.warning();
        router.push({ pathname: '/finish', params: { id: turnover.id } });
        return;
      }
      haptics.error();
      showToast({ message: turnoverFailureMessage(r.reason) });
    } finally {
      setBusy(false);
    }
  };

  const markDone = async (roomId: string) => {
    setBusy(true);
    try {
      const r = await completeRoom(turnover.id, roomId);
      if (!r.ok) {
        haptics.error();
        showToast({ message: turnoverFailureMessage(r.reason) });
        return;
      }
      haptics.roomDone();
      setCelebrate(Date.now());
    } finally {
      setBusy(false);
    }
  };

  const confirmAbandon = () => {
    haptics.warning();
    Alert.alert(
      'Abandon this turnover?',
      'The timer stops. Photos and checks so far stay in History, but no proof link can be published.',
      [
        { text: 'Keep working', style: 'cancel' },
        {
          text: 'Abandon',
          style: 'destructive',
          onPress: async () => {
            const r = await abandonTurnover(turnover.id);
            if (!r.ok) {
              showToast({ message: turnoverFailureMessage(r.reason) });
              return;
            }
            showToast({ message: 'Turnover abandoned' });
            if (router.canGoBack()) router.back();
            else router.replace('/today');
          },
        },
      ],
    );
  };

  const notes = turnover.property?.accessNotes;
  const menu = [
    { id: 'issue', title: 'Report an issue', sf: 'exclamationmark.triangle' as const, onPress: reportIssue },
    ...(notes ? [{ id: 'notes', title: 'Access notes', sf: 'key' as const, onPress: () => Alert.alert('Access notes', notes) }] : []),
    { id: 'abandon', title: 'Abandon turnover', sf: 'xmark.circle' as const, destructive: true, onPress: confirmAbandon },
  ];

  const header = (
    <Stack.Screen
      options={{
        headerTitle: () => <FlowTitle id={turnover.id} />,
        headerRight: () => <OverflowMenu accessibilityLabel="Turnover options" actions={menu} />,
        headerTransparent: false,
        headerLargeTitleEnabled: false,
        headerStyle: { backgroundColor: colors.surface },
      }}
    />
  );

  if (rooms.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, justifyContent: 'center', padding: spacing.lg }}>
        {header}
        <EmptyState
          icon={icons.rooms}
          title="No rooms to walk through"
          body="This property has no rooms. You can finish now, or add rooms to the property first."
          action={<PrimaryButton title="Finish turnover" icon={icons.finish} size="lg" loading={busy} onPress={finish} />}
        />
      </View>
    );
  }

  const roomView = turnover.rooms[current];
  const room = rooms[current]!;
  const allComplete = turnover.progress?.complete ?? false;
  const isLast = current === rooms.length - 1;
  const missing = missingText(roomView);

  let primary: { title: string; icon: IconName; onPress: () => void; disabled?: boolean; hint?: string };
  if (allComplete) primary = { title: 'Finish turnover', icon: icons.finish, onPress: finish };
  else if (roomView?.complete && !roomView.doneAt) primary = { title: 'Room done', icon: icons.check, onPress: () => markDone(room.id) };
  else if (roomView?.complete) {
    const next = turnover.progress?.nextIncompleteRoomIndex;
    primary = { title: 'Next room', icon: icons.chevronForward, onPress: () => next != null && go(next) };
  } else if (isLast) primary = { title: 'Finish turnover', icon: icons.finish, onPress: finish, hint: 'Some rooms are not done yet' };
  else primary = { title: 'Room done', icon: icons.check, onPress: () => undefined, disabled: true, hint: missing ?? undefined };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {header}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.xs,
          borderBottomWidth: hairline,
          borderBottomColor: colors.separator,
        }}
      >
        <IconButton icon={icons.chevronBack} label="Previous room" directional disabled={current === 0} onPress={() => go(current - 1)} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <RoomStepper
            rooms={turnover.rooms.map((r) => ({ roomId: r.roomId, name: r.name, complete: r.complete, current: r.current }))}
            position={position}
            onSelect={go}
          />
        </View>
        <IconButton icon={icons.chevronForward} label="Next room" directional disabled={isLast} onPress={() => go(current + 1)} />
      </View>

      <Animated.FlatList
        ref={listRef}
        data={rooms}
        extraData={turnover}
        keyExtractor={(r) => r.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={current}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => onMomentumScrollEnd(e.nativeEvent.contentOffset.x)}
        windowSize={3}
        initialNumToRender={2}
        renderItem={({ item, index }) => (
          <RoomPage turnover={turnover} room={item} index={index} total={rooms.length} width={width} stampGps={stampGps} bottomInset={spacing.lg} />
        )}
        style={{ flex: 1 }}
      />

      {celebrate !== null ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            key={celebrate}
            entering={CHECK_ENTER}
            exiting={CHECK_EXIT}
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel="Room done"
            style={{ width: 112, height: 112, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name={icons.check} size={56} color={colors.onAccent} weight="bold" />
          </Animated.View>
        </View>
      ) : null}

      <View
        style={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.sm,
          gap: spacing.xs,
          backgroundColor: colors.surface,
          borderTopWidth: hairline,
          borderTopColor: colors.separator,
        }}
      >
        {missing ? (
          <AppText variant="caption" tone="secondary" align="center" accessibilityLiveRegion="polite">
            {missing}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <PrimaryButton
            title="Issue"
            icon={icons.issue}
            variant="issue"
            size="lg"
            block={false}
            accessibilityLabel={`Report an issue in ${room.name}`}
            onPress={reportIssue}
          />
          <PrimaryButton
            title={primary.title}
            icon={primary.icon}
            size="lg"
            loading={busy}
            disabled={primary.disabled}
            accessibilityHint={primary.hint}
            onPress={primary.onPress}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </View>
  );
}
