// iOS Live Activity for a running turnover (Lock Screen banner + Dynamic Island): property, elapsed
// time, rooms done/total and the current room, with "Next room" and "Issue".
//
// The function marked 'widget' is stringified at build time and evaluated in the widget extension's
// isolated runtime: only @expo/ui/swift-ui components / modifiers (unaliased), its props and the
// environment. No hooks, no app imports, no outer-scope constants. Props are JSON (epoch ms).
// The elapsed timer is a native SwiftUI `Text(timerInterval:)` counting up, so it ticks while the
// app is suspended. "Next room" is a Button whose `target` reaches `addUserInteractionListener`
// (live-status.ios.ts); "Issue" is a Link that opens `turnproof://turnover/<id>?issue=1`.
import { Button, Gauge, HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  gaugeStyle,
  lineLimit,
  monospacedDigit,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type TurnoverActivityColors = {
  surface: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentText: string;
  issue: string;
};

export type TurnoverActivityProps = {
  propertyName: string;
  startedAtMs: number;
  roomsDone: number;
  roomsTotal: number;
  /** Current room name ("Bathroom"), or null when every room is done. */
  currentRoom: string | null;
  /** 1-based index of the current room. */
  currentRoomNumber: number;
  /** `turnproof://turnover/<id>?issue=1` */
  issueUrl: string;
  palette: { light: TurnoverActivityColors; dark: TurnoverActivityColors };
};

const TurnoverActivity = (props: TurnoverActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.palette.dark : props.palette.light;
  // Counts up from the start; the upper bound only needs to be far enough away.
  const timer = { lower: new Date(props.startedAtMs), upper: new Date(props.startedAtMs + 24 * 3600 * 1000) };
  const elapsed = (size: number, color: string) => (
    <Text timerInterval={timer} countsDown={false} modifiers={[font({ size, weight: 'semibold' }), monospacedDigit(), foregroundStyle(color)]} />
  );
  const progress = props.roomsTotal > 0 ? props.roomsDone / props.roomsTotal : 1;
  const roomsLabel = `${props.roomsDone}/${props.roomsTotal}`;
  const allDone = props.roomsTotal > 0 && props.roomsDone >= props.roomsTotal;
  const roomLine = allDone
    ? 'All rooms done · finish in the app'
    : props.currentRoom
      ? `Room ${props.currentRoomNumber}: ${props.currentRoom}`
      : 'In progress';

  const ring = (size: number) => (
    <Gauge
      value={progress}
      min={0}
      max={1}
      currentValueLabel={<Text modifiers={[font({ size: size * 0.3, weight: 'semibold' }), monospacedDigit()]}>{roomsLabel}</Text>}
      modifiers={[gaugeStyle('circularCapacity'), tint(c.accent), frame({ width: size, height: size })]}
    />
  );

  const buttons = (
    <HStack spacing={10}>
      <Button target="next-room" label="Next room" systemImage="arrow.right.circle.fill" modifiers={[tint(c.accent)]} />
      <Link destination={props.issueUrl}>
        <HStack spacing={4}>
          <Image systemName="exclamationmark.triangle.fill" color={c.issue} size={15} />
          <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(c.issue)]}>Issue</Text>
        </HStack>
      </Link>
    </HStack>
  );

  return {
    banner: (
      <VStack alignment="leading" spacing={10} modifiers={[padding({ all: 16 }), activityBackgroundTint(c.surface)]}>
        <HStack spacing={12}>
          {ring(44)}
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 17, weight: 'semibold' }), lineLimit(1), foregroundStyle(c.text)]}>{props.propertyName}</Text>
            <Text modifiers={[font({ size: 13 }), lineLimit(1), foregroundStyle(c.textSecondary)]}>{roomLine}</Text>
          </VStack>
          <Spacer />
          <VStack alignment="trailing" spacing={0}>
            {elapsed(20, c.accentText)}
            <Text modifiers={[font({ size: 11 }), foregroundStyle(c.textSecondary)]}>elapsed</Text>
          </VStack>
        </HStack>
        {buttons}
      </VStack>
    ),
    compactLeading: <Image systemName="checklist" color={c.accent} />,
    compactTrailing: <Text modifiers={[font({ size: 14, weight: 'semibold' }), monospacedDigit(), foregroundStyle(c.accent)]}>{roomsLabel}</Text>,
    minimal: <Image systemName="checklist" color={c.accent} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 4 })]}>
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), lineLimit(1)]}>{props.propertyName}</Text>
        <Text modifiers={[font({ size: 12 }), lineLimit(1), foregroundStyle(c.accent)]}>{roomLine}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={2} modifiers={[padding({ trailing: 4 })]}>
        {elapsed(20, c.accent)}
        <Text modifiers={[font({ size: 12 })]}>{`${roomsLabel} rooms`}</Text>
      </VStack>
    ),
    expandedBottom: buttons,
  };
};

export default createLiveActivity<TurnoverActivityProps>('Turnover', TurnoverActivity);
