// Android widget via react-native-android-widget (`NextTurnover`, 2×2).
import { countdownLabel } from '@turnproof/shared';
import { createElement } from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';

import {
  type AndroidWidgetColors,
  NEXT_TURNOVER_WIDGET_NAME,
  NextTurnoverWidgetAndroid,
  type NextTurnoverWidgetAndroidProps,
} from '@/widgets/next-turnover-widget.android';

import { TODAY_URL, turnoverUrl } from './notifications';
import { WIDGET_PALETTE, type WidgetColors } from './widget-palette';
import { buildWidgetSnapshot, type WidgetSnapshot } from './widget-snapshot';

export type { WidgetSnapshot } from './widget-snapshot';

const asColors = (c: WidgetColors) => c as unknown as AndroidWidgetColors;

function toProps(s: WidgetSnapshot): Omit<NextTurnoverWidgetAndroidProps, 'colors'> {
  const footer = s.todayTotal > 0 ? `${s.todayDone}/${s.todayTotal} done today` : 'Nothing else today';
  if (s.active) {
    const rooms = `${s.active.roomsDone}/${s.active.roomsTotal} rooms`;
    return {
      header: 'IN PROGRESS',
      title: s.active.propertyName,
      subtitle: s.active.currentRoom ? `${s.active.currentRoom} · ${rooms}` : rooms,
      alert: false,
      footer,
      ring: s.active.roomsTotal > 0 ? s.active.roomsDone / s.active.roomsTotal : 0,
      url: turnoverUrl(s.active.turnoverId),
    };
  }
  const ring = s.todayTotal > 0 ? s.todayDone / s.todayTotal : 0;
  if (s.next) {
    return {
      header: 'NEXT TURNOVER',
      title: s.next.propertyName,
      // Android widgets refresh by themselves at most every 30 min: the countdown is as of the last update.
      subtitle: `Checkout ${s.next.checkoutLabel} · ${countdownLabel(s.next.scheduledFor, new Date().toISOString())}`,
      alert: s.next.overdue,
      footer,
      ring,
      url: turnoverUrl(s.next.turnoverId),
    };
  }
  return { header: 'NEXT TURNOVER', title: 'All clear', subtitle: 'No turnovers scheduled', alert: false, footer, ring, url: TODAY_URL };
}

/** Light + dark renderings; the launcher picks by system theme. */
export function renderNextTurnoverWidget(s: WidgetSnapshot) {
  const props = toProps(s);
  return {
    light: createElement(NextTurnoverWidgetAndroid, { ...props, colors: asColors(WIDGET_PALETTE.light) }),
    dark: createElement(NextTurnoverWidgetAndroid, { ...props, colors: asColors(WIDGET_PALETTE.dark) }),
  };
}

export async function refreshWidgets(snapshot: WidgetSnapshot): Promise<void> {
  try {
    await requestWidgetUpdate({ widgetName: NEXT_TURNOVER_WIDGET_NAME, renderWidget: () => renderNextTurnoverWidget(snapshot) });
  } catch (error) {
    console.warn('[widgets] requestWidgetUpdate failed', error);
  }
}

export async function refreshWidgetsFromDatabase(): Promise<void> {
  await refreshWidgets(buildWidgetSnapshot());
}
