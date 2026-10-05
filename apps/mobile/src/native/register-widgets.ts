// No-op off Android. The Android variant registers the react-native-android-widget task handler.
// Imported by the JS entry (index.ts) so headless widget updates work with the app closed.
export function registerWidgets(): void {}
