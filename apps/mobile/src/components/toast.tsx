import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createStore, useStore } from '@/data';
import { haptics } from '@/native/haptics';
import { easing, motion, radius, spacing, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';

export type ToastInput = {
  message: string;
  /** e.g. "Undo". The toast stays longer when it offers an action. */
  actionLabel?: string;
  onAction?: () => void;
};

type ToastState = (ToastInput & { id: number }) | null;

const store = createStore<ToastState>(null);
/** Space kept free above the bottom safe area (tab bar by default; the turnover action bar). */
const clearance = createStore<number>(64);
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

/** A short, non-blocking message near the bottom (replaces any current one). */
export function showToast(input: ToastInput): void {
  if (timer) clearTimeout(timer);
  const id = ++seq;
  store.setState({ ...input, id });
  timer = setTimeout(() => dismissToast(id), input.actionLabel ? 6000 : 3200);
}

export function dismissToast(id?: number): void {
  if (id !== undefined && store.getSnapshot()?.id !== id) return;
  if (timer) clearTimeout(timer);
  timer = null;
  store.setState(null);
}

/** While mounted, toasts sit `points` above the bottom safe area (e.g. over an action bar). */
export function useToastClearance(points: number): void {
  useEffect(() => {
    const previous = clearance.getSnapshot();
    clearance.setState(points);
    return () => clearance.setState(previous);
  }, [points]);
}

// Module scope: layout-animation builders are never rebuilt per render. Exit is a little quicker.
const ENTER = FadeInDown.duration(motion.duration.base).easing(easing.out).reduceMotion(ReduceMotion.System);
const EXIT = FadeOutDown.duration(motion.duration.fast + 50).easing(easing.standard).reduceMotion(ReduceMotion.System);

/** Mount once at the root. Undo for checklist and photo actions lives here. */
export function ToastHost() {
  const toast = useStore(store);
  const bottom = useStore(clearance);
  const insets = useSafeAreaInsets();
  const { colors, shadow } = useTheme();
  if (!toast) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', start: 0, end: 0, bottom: insets.bottom + bottom, paddingHorizontal: spacing.md }}
    >
      <Animated.View
        key={toast.id}
        entering={ENTER}
        exiting={EXIT}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={{
          minHeight: touchTarget + spacing.xs,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: colors.inverseSurface,
          boxShadow: shadow('lg'),
          flexDirection: 'row',
          alignItems: 'center',
          paddingStart: spacing.md,
          paddingEnd: toast.actionLabel ? spacing.xs : spacing.md,
          gap: spacing.sm,
        }}
      >
        <AppText variant="callout" tone="inverse" style={{ flex: 1, paddingVertical: spacing.sm }}>
          {toast.message}
        </AppText>
        {toast.actionLabel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.actionLabel}
            hitSlop={spacing.xs}
            onPress={() => {
              haptics.selection();
              toast.onAction?.();
              dismissToast(toast.id);
            }}
            style={({ pressed }) => ({
              minHeight: touchTarget,
              justifyContent: 'center',
              paddingHorizontal: spacing.md,
              borderRadius: radius.sm,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <AppText variant="callout" weight="700" style={{ color: colors.inverseAccent }}>
              {toast.actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}
