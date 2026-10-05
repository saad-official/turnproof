// App entry: background tasks, the Android widget handler and notification / Live Activity action
// handling are registered at module scope (they can run headless), then Expo Router takes over.
import './src/native/entry';
import 'expo-router/entry';
