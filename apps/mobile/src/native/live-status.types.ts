// Shared pieces of the "turnover in progress" status surfaces (iOS Live Activity `Turnover`,
// Android 16 Live Update, ongoing notification below that): the event every surface reports and
// the view model they render.
import type { TurnoverView } from '@/data/views';

import { turnoverUrl } from './notifications';
import { WIDGET_PALETTE, type WidgetPalette } from './widget-palette';

export type StatusActionSource = 'live-activity' | 'live-update' | 'notification';

/**
 * One event for every "do something with this turnover" tap outside the app UI:
 * `next-room` (Live Activity button, notification action), `issue` (opens the app on the issue
 * sheet), `start` / `snooze` (reminder actions).
 */
export type StatusAction = {
  action: 'next-room' | 'issue' | 'start' | 'snooze';
  turnoverId: string | null;
  source: StatusActionSource;
};

export type StatusActionListener = (event: StatusAction) => void;

export type TurnoverStatusView = {
  turnoverId: string;
  propertyName: string;
  startedAt: string;
  roomsDone: number;
  roomsTotal: number;
  currentRoom: string | null;
  /** 1-based index of the current room. */
  currentRoomNumber: number;
  /** Per room in walk-through order: done or not (Android progress segments). */
  roomDone: boolean[];
  url: string;
  issueUrl: string;
  palette: WidgetPalette;
};

/** Builds the status view of a running turnover (null when it has no property any more). */
export function toTurnoverStatusView(view: TurnoverView): TurnoverStatusView | null {
  if (!view.property || !view.progress || !view.startedAt) return null;
  return {
    turnoverId: view.id,
    propertyName: view.property.name,
    startedAt: view.startedAt,
    roomsDone: view.progress.roomsDone,
    roomsTotal: view.progress.roomsTotal,
    currentRoom: view.progress.currentRoomName,
    currentRoomNumber: view.progress.currentRoomIndex + 1,
    roomDone: view.rooms.map((r) => r.complete),
    url: turnoverUrl(view.id),
    issueUrl: turnoverUrl(view.id, 'issue'),
    palette: WIDGET_PALETTE,
  };
}

/** "Bathroom · 2/5 rooms" */
export function statusLine(v: TurnoverStatusView): string {
  const rooms = `${v.roomsDone}/${v.roomsTotal} rooms`;
  return v.currentRoom ? `${v.currentRoom} · ${rooms}` : rooms;
}
