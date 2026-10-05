// Side-effect module imported first by the JS entry (apps/mobile/index.ts), before expo-router.
// The OS can start a headless JS runtime (Android widget update, background task, notification
// action, Live Activity button) that never renders the root layout, so these must run here.
import { defineBackgroundTasks } from './background';
import { registerWidgets } from './register-widgets';
import { startStatusActionHandling } from './status-actions';

defineBackgroundTasks();
registerWidgets();
startStatusActionHandling();
