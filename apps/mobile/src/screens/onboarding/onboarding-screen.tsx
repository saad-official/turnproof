import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { haptics } from '@/native/haptics';
import { dotSize, radius, spacing, touchTarget, useTheme } from '@/theme';

import { ChecklistArt, ProofLinkArt, StampedPairArt } from './illustrations';

type Page = { title: string; body: string; art: ReactNode };

const PAGES: Page[] = [
  {
    title: 'Proof that the turnover happened',
    body: 'Walk each room with a checklist. Turnproof keeps the time you started, every item you ticked and when you finished.',
    art: <ChecklistArt />,
  },
  {
    title: 'Before and after, stamped',
    body: 'Photos are taken in the app, never imported, and stamped with the time, your location and a fingerprint of the file.',
    art: <StampedPairArt />,
  },
  {
    title: 'One link for the host',
    body: 'When you finish, publish a private proof page the host opens in any browser. It expires, and you can revoke it.',
    art: <ProofLinkArt />,
  },
];

function PageView({ page, index, width, scrollX, parallax }: { page: Page; index: number; width: number; scrollX: SharedValue<number>; parallax: boolean }) {
  // Artwork drifts at 30% of the scroll speed; copy fades with distance from centre.
  const artStyle = useAnimatedStyle(() => {
    const offset = scrollX.get() - index * width;
    return {
      transform: [{ translateX: parallax ? offset * 0.3 : 0 }],
      opacity: interpolate(Math.abs(offset), [0, width * 0.8], [1, 0.2], Extrapolation.CLAMP),
    };
  });
  const copyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(scrollX.get() - index * width), [0, width * 0.6], [1, 0], Extrapolation.CLAMP),
  }));
  return (
    <View style={{ width, flex: 1, paddingHorizontal: spacing.lg, gap: spacing.xl, justifyContent: 'center' }}>
      <Animated.View style={[{ alignItems: 'center', minHeight: 240, justifyContent: 'center' }, artStyle]}>{page.art}</Animated.View>
      <Animated.View style={[{ gap: spacing.sm }, copyStyle]}>
        <AppText variant="title" align="center" accessibilityRole="header">
          {page.title}
        </AppText>
        <AppText variant="body" tone="secondary" align="center">
          {page.body}
        </AppText>
      </Animated.View>
    </View>
  );
}

function Dot({ index, width, scrollX }: { index: number; width: number; scrollX: SharedValue<number> }) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => {
    const d = Math.abs(scrollX.get() / Math.max(1, width) - index);
    return {
      opacity: interpolate(d, [0, 1], [1, 0.35], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(d, [0, 1], [1.25, 0.85], Extrapolation.CLAMP) }],
    };
  });
  return <Animated.View style={[{ width: dotSize - 2, height: dotSize - 2, borderRadius: radius.pill, backgroundColor: colors.accent }, style]} />;
}

/** Three short pages (parallax art, page dots, a selection tick per page), then the role picker. */
export function OnboardingScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [page, setPage] = useState(0);
  const lastPage = useRef(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.set(e.contentOffset.x);
  });

  const onPageChange = (next: number) => {
    if (next === lastPage.current) return;
    lastPage.current = next;
    haptics.selection();
    setPage(next);
  };

  // Fires once per page change at most (when the rounded index changes), never per frame.
  useAnimatedReaction(
    () => Math.round(scrollX.get() / Math.max(1, width)),
    (next, prev) => {
      if (prev !== null && next !== prev) scheduleOnRN(onPageChange, next);
    },
  );

  const isLast = page === PAGES.length - 1;
  const next = () => {
    if (isLast) {
      router.push('/role');
      return;
    }
    scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: !reduced });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip introduction"
          onPress={() => router.push('/role')}
          hitSlop={spacing.xs}
          style={({ pressed }) => ({ minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: spacing.sm, opacity: pressed ? 0.6 : 1 })}
        >
          <AppText variant="body" tone="accent" weight="600">
            Skip
          </AppText>
        </Pressable>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {PAGES.map((p, i) => (
          <PageView key={p.title} page={p} index={i} width={width} scrollX={scrollX} parallax={!reduced} />
        ))}
      </Animated.ScrollView>

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <View
          accessible
          accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`}
          style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, padding: spacing.xs }}
        >
          {PAGES.map((p, i) => (
            <Dot key={p.title} index={i} width={width} scrollX={scrollX} />
          ))}
        </View>
        <PrimaryButton title={isLast ? 'Get started' : 'Continue'} size="lg" onPress={next} />
      </View>
    </View>
  );
}
