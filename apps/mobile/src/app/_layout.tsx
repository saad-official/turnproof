import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { showToast, ToastHost } from '@/components/toast';
import { icons } from '@/constants/icons';
import { ensureDatabaseReady, useDatabaseMigrations } from '@/data';
import { hydrateAppPreferences, useAppPreferencesHydrated } from '@/hooks/use-app-preferences';
import { useSettings } from '@/hooks/use-settings';
import { useDetailStackOptions } from '@/hooks/use-stack-options';
import { haptics } from '@/native/haptics';
import { addStatusActionListener } from '@/native/live-status';
import { startNativeServices } from '@/native/surface-sync';
import { AppThemeProvider, radius, spacing, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Notification / Live Activity / widget taps → routes:
 * `turnproof://today` → Today, `turnproof://turnover/<id>[?issue=1]` → the turnover (issue sheet).
 */
function hrefFromUrl(url: string): Href | null {
  const [rawPath = '', query = ''] = url.replace(/^turnproof:\/\/\/?/, '/').split('?');
  const path = rawPath.replace(/\/+$/, '') || '/';
  if (path === '/today' || path === '/') return '/today';
  const turnover = path.match(/^\/turnover\/([^/]+)$/);
  if (turnover?.[1]) {
    const issue = new URLSearchParams(query).get('issue') === '1';
    return { pathname: '/turnover/[id]', params: { id: decodeURIComponent(turnover[1]), ...(issue ? { issue: '1' } : {}) } };
  }
  return null;
}

export default function RootLayout() {
  const db = useDatabaseMigrations();
  const prefsReady = useAppPreferencesHydrated();

  useEffect(() => {
    if (db.success) hydrateAppPreferences();
  }, [db.success]);

  const ready = (db.success && prefsReady) || !!db.error;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (db.error) {
    return (
      <AppThemeProvider>
        <DatabaseErrorScreen error={db.error} />
      </AppThemeProvider>
    );
  }
  if (!db.success || !prefsReady) return null; // the splash screen stays up
  return (
    <AppThemeProvider>
      <App />
    </AppThemeProvider>
  );
}

function App() {
  const { onboarded } = useSettings();
  const { colors, isDark } = useTheme();
  const reduced = useReducedMotion();
  const detail = useDetailStackOptions();

  useEffect(
    () =>
      startNativeServices({
        onOpenUrl: (url) => {
          const href = hrefFromUrl(url);
          if (href) router.navigate(href);
        },
      }),
    [],
  );

  // "Next room" pressed on the Lock Screen, Dynamic Island or a notification: the data layer has
  // already applied it; the UI only acknowledges it when the app is in front.
  useEffect(
    () =>
      addStatusActionListener((event) => {
        if (AppState.currentState !== 'active') return;
        if (event.action === 'next-room') {
          haptics.roomChange();
          showToast({ message: 'Moved to the next room' });
        } else if (event.action === 'snooze') {
          showToast({ message: 'Reminder snoozed for 30 minutes' });
        }
      }),
    [],
  );

  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accentText,
      background: colors.surface,
      card: colors.surface,
      text: colors.text,
      border: colors.separator,
      notification: colors.issue,
    },
  };

  const sheet = (detents: number[]) =>
    ({
      presentation: 'formSheet',
      sheetGrabberVisible: true,
      sheetAllowedDetents: detents,
      sheetCornerRadius: radius.lg,
      headerShown: false,
      contentStyle: { backgroundColor: colors.surface },
    }) as const;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
          <Stack.Protected guard={onboarded}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="turnover/[id]" options={{ ...detail, headerShown: true, title: '' }} />
            <Stack.Screen name="summary/[id]" options={{ ...detail, headerShown: true, title: 'Summary' }} />
            <Stack.Screen
              name="capture"
              options={{
                presentation: 'fullScreenModal',
                animation: reduced ? 'fade' : 'slide_from_bottom',
                contentStyle: { backgroundColor: colors.cameraBackground },
                statusBarStyle: 'light',
              }}
            />
            <Stack.Screen name="photo/[id]" options={sheet([1])} />
            <Stack.Screen name="issue" options={sheet([1])} />
            <Stack.Screen name="finish" options={sheet([0.75, 1])} />
            <Stack.Screen name="schedule" options={sheet([0.75, 1])} />
            <Stack.Screen name="property-editor" options={sheet([1])} />
            <Stack.Screen name="join" options={sheet([0.6, 1])} />
            <Stack.Screen name="account" options={sheet([1])} />
            <Stack.Screen name="delete-account" options={sheet([0.75, 1])} />
          </Stack.Protected>
          <Stack.Protected guard={!onboarded}>
            <Stack.Screen name="(onboarding)" />
          </Stack.Protected>
        </Stack>
        <ToastHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function DatabaseErrorScreen({ error }: { error: Error }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md }}
      >
        <EmptyState
          icon={icons.database}
          title="Turnproof couldn't open its data"
          body="Nothing has been deleted. Try again; if it keeps failing, restart the app or contact support."
          action={<PrimaryButton title="Try again" block={false} onPress={() => ensureDatabaseReady().catch(() => undefined)} />}
        />
        <AppText variant="caption" tone="tertiary" selectable align="center">
          {error.message}
        </AppText>
      </ScrollView>
    </View>
  );
}
