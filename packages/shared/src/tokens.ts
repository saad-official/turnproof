/**
 * Turnproof design tokens: one source for the Expo app (`apps/mobile/src/theme`)
 * and the web (`toCssVars` -> `--tp-*` custom properties). Pure data, no deps.
 *
 * Identity "fresh linen": warm off-white surfaces by day and a quiet
 * near-black by night, ink text, a deep green accent (clean, done), coral for
 * issues and damage, and a teal reserved for the "Verified capture" badge.
 * Soft shadows, rounded photo tiles, a humanist type face. Numbers are
 * unitless (points on mobile, CSS px on the web).
 */

export type ColorScheme = "light" | "dark";

export type ColorRole =
  | "surface"
  | "surfaceElevated"
  | "surfaceSunken"
  | "text"
  | "textSecondary"
  | "textTertiary"
  | "accent"
  | "accentPressed"
  | "accentSoft"
  | "accentText"
  | "onAccent"
  | "issue"
  | "issueSoft"
  | "issueText"
  | "onIssue"
  | "verified"
  | "verifiedSoft"
  | "verifiedText"
  | "onVerified"
  | "warning"
  | "warningSoft"
  | "separator"
  | "border";

export type ColorPalette = Record<ColorRole, string>;

export const colors = {
  light: {
    /** Linen: the page and screen background. */
    surface: "#FAF8F4",
    /** Cards, sheets, photo tiles. */
    surfaceElevated: "#FFFFFF",
    /** Wells, inputs, empty photo slots. */
    surfaceSunken: "#F1EDE5",
    /** Ink. */
    text: "#1A1F24",
    textSecondary: "#545C64",
    /** Placeholders and disabled labels only (not body copy). */
    textTertiary: "#7D858C",
    /** Deep green: primary buttons, progress, done checks. */
    accent: "#1F6B4A",
    accentPressed: "#185A3D",
    accentSoft: "#E1EFE6",
    /** Green that reads as text and links (WCAG AA on every surface). */
    accentText: "#1F6B4A",
    onAccent: "#FFFFFF",
    /** Coral: issues, damage, overdue. A fill; use `issueText` for small text. */
    issue: "#E0633F",
    issueSoft: "#FBE6DE",
    issueText: "#B5452A",
    onIssue: "#1A1F24",
    /** Teal: the "Verified capture" badge only. */
    verified: "#0E7C86",
    verifiedSoft: "#DDF1F2",
    verifiedText: "#0B5E66",
    onVerified: "#FFFFFF",
    warning: "#8A5A00",
    warningSoft: "#FBEFD5",
    separator: "#E7E2D8",
    border: "#D6D0C4",
  },
  dark: {
    surface: "#121417",
    surfaceElevated: "#1C2025",
    surfaceSunken: "#0C0E10",
    text: "#ECEEF0",
    textSecondary: "#A9B0B7",
    textTertiary: "#6F777E",
    accent: "#3F9F74",
    accentPressed: "#52B086",
    accentSoft: "#15291F",
    accentText: "#5FC093",
    onAccent: "#0A1F15",
    issue: "#F08A66",
    issueSoft: "#3A1C14",
    issueText: "#F08A66",
    onIssue: "#2A0D04",
    verified: "#4CC3C8",
    verifiedSoft: "#0F2E30",
    verifiedText: "#4CC3C8",
    onVerified: "#04201F",
    warning: "#E8B04B",
    warningSoft: "#33270F",
    separator: "#262B31",
    border: "#363C43",
  },
} as const satisfies Record<ColorScheme, ColorPalette>;

/** 4-pt spacing scale. */
export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export type SpacingToken = keyof typeof spacing;

/** Photo tiles use `md`, cards `lg`, chips and inputs `sm`. */
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;
export type RadiusToken = keyof typeof radius;

/** React Native `fontWeight` strings; valid CSS `font-weight` values too. */
export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;
export type FontWeight = (typeof fontWeight)[keyof typeof fontWeight];

/**
 * Humanist sans. The web loads Source Sans 3; on device the system face
 * (SF Pro / Roboto) is used so Dynamic Type and font scaling just work.
 */
export const fontFamily = {
  web: '"Source Sans 3", "Segoe UI", system-ui, -apple-system, sans-serif',
  ios: "System",
  android: "sans-serif",
} as const;

export type TextStyleToken = {
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeight;
  /** Tracking in points/px (RN `letterSpacing`). */
  letterSpacing: number;
};

export const type = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: fontWeight.bold, letterSpacing: -0.6 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: fontWeight.semibold, letterSpacing: -0.4 },
  headline: { fontSize: 20, lineHeight: 26, fontWeight: fontWeight.semibold, letterSpacing: -0.1 },
  body: { fontSize: 17, lineHeight: 25, fontWeight: fontWeight.regular, letterSpacing: 0 },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: fontWeight.regular, letterSpacing: 0 },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: fontWeight.medium, letterSpacing: 0.1 },
} as const satisfies Record<string, TextStyleToken>;
export type TypeToken = keyof typeof type;

export type SpringConfig = { damping: number; stiffness: number; mass: number };
export type Bezier = readonly [number, number, number, number];

export const motion = {
  /** Milliseconds. */
  duration: { fast: 150, base: 250, slow: 400 },
  /** Cubic-bezier control points (CSS `cubic-bezier()`, Reanimated `Easing.bezier`). */
  easing: {
    standard: [0.2, 0, 0, 1],
    exit: [0.3, 0, 1, 1],
  },
  /** Reanimated `withSpring` configs. */
  spring: {
    /** Checks, shutter, chips. */
    gentle: { damping: 18, stiffness: 200, mass: 1 },
    /** Room-to-room slide, sheets, photo tiles. */
    soft: { damping: 24, stiffness: 120, mass: 1 },
  },
} as const satisfies {
  duration: Record<string, number>;
  easing: Record<string, Bezier>;
  spring: Record<string, SpringConfig>;
};

export type ShadowToken = {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  /** Shadow colour is always `SHADOW_COLOR`; opacity carries the weight. */
  opacity: number;
  /** Android elevation equivalent. */
  elevation: number;
};

/** A warm ink, so shadows on linen never look grey-blue. */
export const SHADOW_COLOR = "#2B2620";

export const shadows = {
  light: {
    sm: { offsetX: 0, offsetY: 1, blur: 2, spread: 0, opacity: 0.06, elevation: 1 },
    md: { offsetX: 0, offsetY: 6, blur: 20, spread: -4, opacity: 0.1, elevation: 3 },
    lg: { offsetX: 0, offsetY: 20, blur: 44, spread: -12, opacity: 0.16, elevation: 10 },
  },
  dark: {
    sm: { offsetX: 0, offsetY: 1, blur: 2, spread: 0, opacity: 0.4, elevation: 1 },
    md: { offsetX: 0, offsetY: 6, blur: 20, spread: -4, opacity: 0.45, elevation: 3 },
    lg: { offsetX: 0, offsetY: 20, blur: 44, spread: -12, opacity: 0.55, elevation: 10 },
  },
} as const satisfies Record<ColorScheme, Record<"sm" | "md" | "lg", ShadowToken>>;
export type ShadowLevel = keyof (typeof shadows)["light"];

export const tokens = { colors, spacing, radius, fontWeight, fontFamily, type, motion, shadows } as const;
export type Tokens = typeof tokens;

export type CssVarName = `--tp-${string}`;

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function shadowCss(shadow: ShadowToken): string {
  const r = parseInt(SHADOW_COLOR.slice(1, 3), 16);
  const g = parseInt(SHADOW_COLOR.slice(3, 5), 16);
  const b = parseInt(SHADOW_COLOR.slice(5, 7), 16);
  return `${shadow.offsetX} ${shadow.offsetY}px ${shadow.blur}px ${shadow.spread}px rgb(${r} ${g} ${b} / ${shadow.opacity})`;
}

/**
 * Flat `--tp-*` custom properties for one scheme, e.g.
 * `--tp-color-on-accent`, `--tp-space-md: 16px`, `--tp-font-size-body: 17px`.
 * Non-colour tokens are identical in both schemes.
 */
export function toCssVars(scheme: ColorScheme): Record<CssVarName, string> {
  const vars: Record<CssVarName, string> = {};
  for (const [role, value] of Object.entries(colors[scheme])) vars[`--tp-color-${kebab(role)}`] = value;
  for (const [name, value] of Object.entries(spacing)) vars[`--tp-space-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(radius)) vars[`--tp-radius-${name}`] = `${value}px`;
  for (const [name, style] of Object.entries(type)) {
    vars[`--tp-font-size-${name}`] = `${style.fontSize}px`;
    vars[`--tp-line-height-${name}`] = `${style.lineHeight}px`;
    vars[`--tp-font-weight-${name}`] = style.fontWeight;
    vars[`--tp-letter-spacing-${name}`] = `${style.letterSpacing}px`;
  }
  for (const [name, ms] of Object.entries(motion.duration)) vars[`--tp-duration-${name}`] = `${ms}ms`;
  for (const [name, points] of Object.entries(motion.easing)) {
    vars[`--tp-ease-${name}`] = `cubic-bezier(${points.join(", ")})`;
  }
  for (const [name, shadow] of Object.entries(shadows[scheme])) vars[`--tp-shadow-${name}`] = shadowCss(shadow);
  return vars;
}
