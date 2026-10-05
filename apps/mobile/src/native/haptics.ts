// Semantic haptics (expo-haptics). Fire-and-forget; silently no-op where unsupported.
import * as Haptics from 'expo-haptics';

const run = (p: Promise<void>) => {
  p.catch(() => undefined);
};

export const haptics = {
  /** Camera shutter: a crisp, short tap the moment the photo is taken. */
  shutter: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  /** A checklist item checked / unchecked. */
  toggle: () => run(Haptics.selectionAsync()),
  /** A room marked done. */
  roomDone: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Moving to another room (room-to-room slide). */
  roomChange: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Turnover started. */
  started: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Turnover finished / proof link published. */
  finished: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** An issue reported. */
  issue: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Picker / segmented / chip selection changes. */
  selection: () => run(Haptics.selectionAsync()),
  /** A validation or network error the user must notice. */
  warning: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
