// Resolves the shared "fresh linen" palette for one colour scheme, plus the few derived roles the
// app paints with (toasts, scrims, photo chips, the always-dark camera). Pure and memoised.
import {
  colors as palettes,
  SHADOW_COLOR,
  shadows,
  type ColorPalette,
  type ColorScheme,
  type ShadowLevel,
} from '@turnproof/shared/tokens';

export type ThemeColors = ColorPalette & {
  /** Inverted surface for toasts. */
  inverseSurface: string;
  inverseText: string;
  /** Action text on the inverse surface (the toast "Undo"). */
  inverseAccent: string;
  /** Dimmed backdrop behind transient overlays. */
  scrim: string;
  /** Unfilled part of progress tracks and empty stepper dots. */
  track: string;
  /** Stamp chips drawn on top of photos: the same in both schemes (they sit on the image). */
  photoChip: string;
  onPhotoChip: string;
  /** The camera screen is always dark, whatever the app scheme. */
  cameraBackground: string;
  cameraControl: string;
  cameraText: string;
  cameraTextSecondary: string;
  /** Shutter ring and flash. */
  shutter: string;
  flash: string;
};

export type AppTheme = {
  scheme: ColorScheme;
  isDark: boolean;
  colors: ThemeColors;
  /** CSS `boxShadow` for an elevation level (never legacy shadow props). */
  shadow: (level: ShadowLevel) => string;
};

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `#RRGGBB` + alpha → `rgba(...)`: translucent tints derived from theme roles. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const SHADOW_RGB = rgb(SHADOW_COLOR).join(', ');
const cache = new Map<ColorScheme, AppTheme>();

/** The camera always paints with the dark palette. */
export const cameraPalette: ColorPalette = palettes.dark;

export function buildAppTheme(scheme: ColorScheme): AppTheme {
  const hit = cache.get(scheme);
  if (hit) return hit;
  const base: ColorPalette = palettes[scheme];
  const inverse: ColorPalette = palettes[scheme === 'dark' ? 'light' : 'dark'];
  const isDark = scheme === 'dark';
  const colors: ThemeColors = {
    ...base,
    inverseSurface: inverse.surfaceElevated,
    inverseText: inverse.text,
    inverseAccent: inverse.accentText,
    scrim: `rgba(${SHADOW_RGB}, ${isDark ? 0.6 : 0.35})`,
    track: isDark ? base.border : base.surfaceSunken,
    photoChip: withAlpha(cameraPalette.surfaceSunken, 0.7),
    onPhotoChip: cameraPalette.text,
    cameraBackground: cameraPalette.surfaceSunken,
    cameraControl: withAlpha(cameraPalette.surfaceElevated, 0.72),
    cameraText: cameraPalette.text,
    cameraTextSecondary: cameraPalette.textSecondary,
    shutter: palettes.light.surfaceElevated,
    flash: palettes.light.surfaceElevated,
  };
  const levels = shadows[scheme];
  const theme: AppTheme = {
    scheme,
    isDark,
    colors,
    shadow: (level) => {
      const s = levels[level];
      return `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread}px rgba(${SHADOW_RGB}, ${s.opacity})`;
    },
  };
  cache.set(scheme, theme);
  return theme;
}
