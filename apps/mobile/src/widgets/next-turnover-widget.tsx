// iOS home-screen / Lock Screen widget `NextTurnover`: the next turnover (property, checkout time,
// countdown) and today's count; while a turnover runs, the circular Lock Screen widget shows its
// rooms progress.
//
// The function marked 'widget' is stringified at build time and evaluated in the widget extension's
// isolated runtime: only @expo/ui/swift-ui components / modifiers (unaliased), its props and the
// environment. No hooks, no app imports, no outer-scope constants. Props are JSON (epoch ms).
import { AccessoryWidgetBackground, Gauge, HStack, Image, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  gaugeStyle,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  padding,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type NextTurnoverWidgetColors = {
  surface: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentText: string;
  issue: string;
  track: string;
};

export type NextTurnoverWidgetProps = {
  propertyName: string | null;
  checkoutAtMs: number | null;
  /** Locale-formatted checkout time, e.g. "11:00 AM". */
  checkoutLabel: string | null;
  /** `turnproof://turnover/<id>` of the next (or running) turnover, else `turnproof://today`. */
  url: string;
  todayTotal: number;
  todayDone: number;
  /** Running turnover (rooms progress), or null. */
  activePropertyName: string | null;
  activeRoomsDone: number;
  activeRoomsTotal: number;
  activeRoom: string | null;
  palette: { light: NextTurnoverWidgetColors; dark: NextTurnoverWidgetColors };
};

const NextTurnoverWidget = (props: NextTurnoverWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.palette.dark : props.palette.light;
  const family = environment.widgetFamily;
  const active = props.activePropertyName != null;
  const hasNext = props.propertyName != null && props.checkoutAtMs != null;
  const checkout = hasNext ? new Date(props.checkoutAtMs as number) : null;
  const upcoming = checkout != null && checkout.getTime() > environment.date.getTime();
  const roomsProgress = props.activeRoomsTotal > 0 ? props.activeRoomsDone / props.activeRoomsTotal : 0;
  const roomsLabel = `${props.activeRoomsDone}/${props.activeRoomsTotal}`;
  const todayLabel = props.todayTotal > 0 ? `${props.todayDone}/${props.todayTotal} today` : 'None today';

  if (family === 'accessoryCircular') {
    if (active) {
      return (
        <ZStack modifiers={[widgetURL(props.url)]}>
          <AccessoryWidgetBackground />
          <Gauge
            value={roomsProgress}
            min={0}
            max={1}
            currentValueLabel={<Text modifiers={[font({ size: 14, weight: 'semibold' }), monospacedDigit()]}>{roomsLabel}</Text>}
            modifiers={[gaugeStyle('circularCapacity')]}
          />
        </ZStack>
      );
    }
    return (
      <ZStack modifiers={[widgetURL(props.url)]}>
        <AccessoryWidgetBackground />
        <VStack spacing={0}>
          <Image systemName="checklist" size={14} />
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), monospacedDigit(), minimumScaleFactor(0.6)]}>
            {props.todayTotal > 0 ? `${props.todayDone}/${props.todayTotal}` : '–'}
          </Text>
        </VStack>
      </ZStack>
    );
  }

  if (family === 'accessoryInline') {
    return (
      <Text modifiers={[widgetURL(props.url)]}>
        {active
          ? `${props.activePropertyName} · ${roomsLabel} rooms`
          : hasNext
            ? `${props.propertyName} · ${props.checkoutLabel ?? ''}`
            : 'Turnproof · nothing scheduled'}
      </Text>
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url)]}>
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(1)]}>
          {active ? (props.activePropertyName ?? '') : hasNext ? (props.propertyName ?? '') : 'No turnovers'}
        </Text>
        {active ? (
          <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{`${roomsLabel} rooms · ${props.activeRoom ?? 'done'}`}</Text>
        ) : hasNext && upcoming ? (
          <Text date={checkout as Date} dateStyle="relative" modifiers={[font({ size: 12 }), monospacedDigit(), lineLimit(1)]} />
        ) : hasNext ? (
          <Text modifiers={[font({ size: 12 })]}>{`Checkout ${props.checkoutLabel ?? ''} · overdue`}</Text>
        ) : (
          <Text modifiers={[font({ size: 12 })]}>{todayLabel}</Text>
        )}
      </VStack>
    );
  }

  const nextBlock = active ? (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[font({ size: 17, weight: 'semibold' }), lineLimit(2), minimumScaleFactor(0.7), foregroundStyle(c.text)]}>
        {props.activePropertyName ?? ''}
      </Text>
      <Text modifiers={[font({ size: 13, weight: 'medium' }), monospacedDigit(), foregroundStyle(c.accentText)]}>
        {`${roomsLabel} rooms`}
      </Text>
      <Text modifiers={[font({ size: 12 }), lineLimit(1), foregroundStyle(c.textSecondary)]}>{props.activeRoom ?? 'All rooms done'}</Text>
    </VStack>
  ) : hasNext ? (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[font({ size: 17, weight: 'semibold' }), lineLimit(2), minimumScaleFactor(0.7), foregroundStyle(c.text)]}>
        {props.propertyName ?? ''}
      </Text>
      <Text modifiers={[font({ size: 13, weight: 'medium' }), monospacedDigit(), foregroundStyle(c.accentText)]}>
        {`Checkout ${props.checkoutLabel ?? ''}`}
      </Text>
      {upcoming ? (
        <Text
          date={checkout as Date}
          dateStyle="relative"
          modifiers={[font({ size: 12 }), monospacedDigit(), lineLimit(1), foregroundStyle(c.textSecondary)]}
        />
      ) : (
        <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(c.issue)]}>Overdue</Text>
      )}
    </VStack>
  ) : (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[font({ size: 17, weight: 'semibold' }), foregroundStyle(c.text)]}>All clear</Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle(c.textSecondary)]}>No turnovers scheduled</Text>
    </VStack>
  );

  const header = active ? 'IN PROGRESS' : 'NEXT TURNOVER';

  if (family === 'systemMedium') {
    return (
      <HStack spacing={16} modifiers={[padding({ all: 4 }), containerBackground(c.surface, 'widget'), widgetURL(props.url)]}>
        <VStack alignment="leading" spacing={6}>
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(c.textSecondary)]}>{header}</Text>
          {nextBlock}
        </VStack>
        <Spacer />
        <VStack alignment="center" spacing={4}>
          <Gauge
            value={active ? roomsProgress : props.todayTotal > 0 ? props.todayDone / props.todayTotal : 0}
            min={0}
            max={1}
            currentValueLabel={
              <Text modifiers={[font({ size: 13, weight: 'semibold' }), monospacedDigit()]}>
                {active ? roomsLabel : props.todayTotal > 0 ? `${props.todayDone}/${props.todayTotal}` : '–'}
              </Text>
            }
            modifiers={[gaugeStyle('circularCapacity'), tint(c.accent)]}
          />
          <Text modifiers={[font({ size: 11 }), foregroundStyle(c.textSecondary)]}>{active ? 'rooms' : 'today'}</Text>
        </VStack>
      </HStack>
    );
  }

  // systemSmall
  return (
    <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 2 }), containerBackground(c.surface, 'widget'), widgetURL(props.url)]}>
      <HStack>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.textSecondary)]}>{header}</Text>
        <Spacer />
      </HStack>
      {nextBlock}
      <Spacer />
      <Text modifiers={[font({ size: 11 }), monospacedDigit(), foregroundStyle(c.textSecondary)]}>{todayLabel}</Text>
    </VStack>
  );
};

export default createWidget<NextTurnoverWidgetProps>('NextTurnover', NextTurnoverWidget);
