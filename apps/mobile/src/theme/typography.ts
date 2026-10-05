import { type, type TypeToken } from '@turnproof/shared/tokens';
import type { TextStyle } from 'react-native';

/** RN text style for a type-scale step (system SF Pro / Roboto; scales with Dynamic Type). */
export function typeStyle(token: TypeToken): TextStyle {
  const t = type[token];
  return { fontSize: t.fontSize, lineHeight: t.lineHeight, fontWeight: t.fontWeight, letterSpacing: t.letterSpacing };
}

/** Pre-built styles for every step, so components never rebuild them per render. */
export const textStyles = {
  display: typeStyle('display'),
  title: typeStyle('title'),
  headline: typeStyle('headline'),
  body: typeStyle('body'),
  callout: typeStyle('callout'),
  caption: typeStyle('caption'),
} as const satisfies Record<TypeToken, TextStyle>;

/** Fixed-width figures for numbers that change in place (timers, counts, countdowns). */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * Dynamic Type cap for text inside fixed-size chrome (pills, stamp chips, the stepper).
 * Body copy is never capped: rows grow with the text instead.
 */
export const CHROME_FONT_CAP = 1.6;
