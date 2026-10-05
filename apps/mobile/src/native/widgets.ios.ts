// iOS widget via expo-widgets: `NextTurnover` (systemSmall/Medium, accessoryCircular/Rectangular/Inline).
import NextTurnoverWidget, { type NextTurnoverWidgetProps } from '@/widgets/next-turnover-widget';

import { TODAY_URL, turnoverUrl } from './notifications';
import { WIDGET_PALETTE } from './widget-palette';
import { buildWidgetSnapshot, upcomingChangeInstants, type WidgetSnapshot } from './widget-snapshot';

export type { WidgetSnapshot } from './widget-snapshot';

function toProps(s: WidgetSnapshot): NextTurnoverWidgetProps {
  const target = s.active?.turnoverId ?? s.next?.turnoverId ?? null;
  return {
    propertyName: s.next?.propertyName ?? null,
    checkoutAtMs: s.next ? Date.parse(s.next.scheduledFor) : null,
    checkoutLabel: s.next?.checkoutLabel ?? null,
    url: target ? turnoverUrl(target) : TODAY_URL,
    todayTotal: s.todayTotal,
    todayDone: s.todayDone,
    activePropertyName: s.active?.propertyName ?? null,
    activeRoomsDone: s.active?.roomsDone ?? 0,
    activeRoomsTotal: s.active?.roomsTotal ?? 0,
    activeRoom: s.active?.currentRoom ?? null,
    palette: WIDGET_PALETTE,
  };
}

export async function refreshWidgets(snapshot: WidgetSnapshot): Promise<void> {
  try {
    NextTurnoverWidget.updateSnapshot(toProps(snapshot));
  } catch (error) {
    console.warn('[widgets] updateSnapshot failed', error);
  }
}

/**
 * Current snapshot plus timeline entries at each upcoming checkout and local midnight, so the
 * widget moves on (overdue, the next day's count) while the app is not running.
 */
export async function refreshWidgetsFromDatabase(): Promise<void> {
  try {
    const now = Date.now();
    const entries = [now, ...upcomingChangeInstants()].map((at) => ({
      date: new Date(at),
      props: toProps(buildWidgetSnapshot(at + 1000)),
    }));
    NextTurnoverWidget.updateTimeline(entries);
  } catch (error) {
    console.warn('[widgets] updateTimeline failed', error);
    await refreshWidgets(buildWidgetSnapshot());
  }
}
