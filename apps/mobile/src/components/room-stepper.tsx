import { I18nManager, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { dotSize, radius, touchTarget, useTheme } from '@/theme';

export type StepperRoom = { roomId: string; name: string; complete: boolean; current: boolean };

const RING = 20;

/**
 * Room dots: filled green when done, hollow when not. A ring follows the room pager's scroll
 * position frame by frame (a shared value, UI thread), so it slides with the finger. Every dot is a
 * button that jumps to its room.
 */
export function RoomStepper({
  rooms,
  position,
  onSelect,
}: {
  rooms: StepperRoom[];
  /** Fractional page index from the pager. */
  position: SharedValue<number>;
  onSelect: (index: number) => void;
}) {
  const { colors } = useTheme();
  const slot = rooms.length > 10 ? 22 : 28;
  const dir = I18nManager.isRTL ? -1 : 1;
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dir * position.get() * slot }],
  }));
  if (rooms.length < 2) return null;
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'center', height: touchTarget, alignItems: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            start: (slot - RING) / 2,
            width: RING,
            height: RING,
            borderRadius: radius.pill,
            borderWidth: 2,
            borderColor: colors.accent,
          },
          ringStyle,
        ]}
      />
      {rooms.map((room, i) => (
        <Pressable
          key={room.roomId}
          accessibilityRole="button"
          accessibilityLabel={`${room.name}, room ${i + 1} of ${rooms.length}${room.complete ? ', done' : ''}`}
          accessibilityState={{ selected: room.current }}
          onPress={() => onSelect(i)}
          hitSlop={{ top: 8, bottom: 8 }}
          style={{ width: slot, height: touchTarget, alignItems: 'center', justifyContent: 'center' }}
        >
          <View
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: radius.pill,
              backgroundColor: room.complete ? colors.accent : colors.track,
              borderWidth: room.complete ? 0 : 1.5,
              borderColor: colors.textTertiary,
            }}
          />
        </Pressable>
      ))}
    </View>
  );
}
