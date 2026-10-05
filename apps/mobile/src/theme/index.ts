// One theme entry point: `import { spacing, useTheme, textStyles } from '@/theme'`.
// Values come from `@turnproof/shared/tokens`; this folder only resolves them for React Native
// (colour scheme, derived roles, Reanimated easings) and adds layout constants.
import { Platform, StyleSheet } from 'react-native';

export { fontWeight, motion, radius, shadows, spacing, type } from '@turnproof/shared/tokens';
export type { ColorScheme, RadiusToken, ShadowLevel, SpacingToken, TypeToken } from '@turnproof/shared/tokens';
export { cssEasing, easing, springs } from './motion';
export { buildAppTheme, cameraPalette, withAlpha, type AppTheme, type ThemeColors } from './palette';
export { AppThemeProvider } from './theme-provider';
export { ThemeContext, useTheme } from './theme-context';
export { CHROME_FONT_CAP, tabular, textStyles, typeStyle } from './typography';

/** One device pixel: list separators only. */
export const hairline = StyleSheet.hairlineWidth;

/** Minimum touch target (HIG 44 pt / Material 48 dp). */
export const touchTarget = Platform.select({ android: 48, default: 44 });

/**
 * Turnover actions (Room done, Finish, checklist toggles, Add photo) are bigger: cleaners work
 * one-handed, often in wet gloves.
 */
export const actionTarget = 56;

/** The camera shutter. */
export const shutterSize = 80;

/** Photo tile edge in room rows; the camera's thumbnail strip uses `thumbSize`. */
export const tileSize = 116;
export const thumbSize = 56;

/** Stepper dots and the small status glyphs inside chips. */
export const dotSize = 10;
