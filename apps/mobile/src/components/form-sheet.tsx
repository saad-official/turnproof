import { router } from 'expo-router';
import type { ReactNode, Ref } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHROME_FONT_CAP, hairline, spacing, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';

/** Height of the sheet header (below the iOS grabber). */
const HEADER_HEIGHT = touchTarget + spacing.sm;

function HeaderButton({
  label,
  onPress,
  emphasis,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  emphasis?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      hitSlop={spacing.xs}
      style={({ pressed }) => ({
        minHeight: touchTarget,
        minWidth: touchTarget,
        paddingHorizontal: spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color={colors.accentText} />
      ) : (
        <AppText variant="body" weight={emphasis ? '700' : '400'} tone="accent" maxFontSizeMultiplier={CHROME_FONT_CAP}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

export type FormSheetProps = {
  title: string;
  children: ReactNode;
  /** Header primary action label ("Save"). Omit for read-only sheets or when `footer` carries it. */
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  busy?: boolean;
  /** Leading action; defaults to "Cancel" which dismisses the sheet. */
  leadingLabel?: string;
  onLeading?: () => void;
  /** Bottom-anchored actions (thumb reach), outside the scroll view. */
  footer?: ReactNode;
  scrollRef?: Ref<ScrollView>;
};

/**
 * Content of a `formSheet` route: a header row (Cancel / title / primary action) above a scrolling
 * form, with an optional bottom-anchored footer. Drag-to-dismiss stays native; the header just names
 * the task. Works on Android too, where form sheets cannot host a native header.
 */
export function FormSheet({
  title,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  busy,
  leadingLabel = 'Cancel',
  onLeading,
  footer,
  scrollRef,
}: FormSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const leading = onLeading ?? (() => router.back());
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: process.env.EXPO_OS === 'ios' ? spacing.xs : spacing.md, backgroundColor: colors.surface }}>
        <View style={{ minHeight: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs }}>
          <HeaderButton label={leadingLabel} onPress={leading} />
          <AppText
            variant="body"
            weight="600"
            align="center"
            numberOfLines={1}
            accessibilityRole="header"
            maxFontSizeMultiplier={CHROME_FONT_CAP}
            style={{ flex: 1 }}
          >
            {title}
          </AppText>
          {primaryLabel && onPrimary ? (
            <HeaderButton label={primaryLabel} onPress={onPrimary} emphasis disabled={primaryDisabled} busy={busy} />
          ) : (
            <View style={{ minWidth: touchTarget }} />
          )}
        </View>
        <View style={{ height: hairline, backgroundColor: colors.separator }} />
      </View>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            paddingHorizontal: spacing.md,
            paddingTop: spacing.sm,
            paddingBottom: Math.max(insets.bottom, spacing.md),
            gap: spacing.xs,
            backgroundColor: colors.surface,
            borderTopWidth: hairline,
            borderTopColor: colors.separator,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}
