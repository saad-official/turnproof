// Default (web / unsupported) implementation. iOS: widgets.ios.ts, Android: widgets.android.ts.
import { buildWidgetSnapshot, type WidgetSnapshot } from './widget-snapshot';

export type { WidgetSnapshot } from './widget-snapshot';

/** Push a snapshot to every home-screen / Lock Screen widget. */
export async function refreshWidgets(_snapshot: WidgetSnapshot): Promise<void> {}

/** Rebuild the snapshot from SQLite and refresh widgets (after every turnover / property change). */
export async function refreshWidgetsFromDatabase(): Promise<void> {
  await refreshWidgets(buildWidgetSnapshot());
}
