import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from '@/widgets/widget-task-handler';

let registered = false;

/**
 * Registers the headless widget task handler. Idempotent. It must run at JS entry (index.ts):
 * the launcher can start a headless JS runtime that never renders the root layout.
 */
export function registerWidgets(): void {
  if (registered) return;
  registered = true;
  registerWidgetTaskHandler(widgetTaskHandler);
}
