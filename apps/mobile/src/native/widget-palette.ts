// Colours the widgets and the Live Activity need, for both schemes, from the shared design tokens
// (widgets render outside the app's theme provider, so they receive plain hex strings).
import { colors } from '@turnproof/shared';

export type WidgetColors = {
  surface: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentText: string;
  onAccent: string;
  issue: string;
  track: string;
};
export type WidgetPalette = { light: WidgetColors; dark: WidgetColors };

const pick = (scheme: 'light' | 'dark'): WidgetColors => {
  const c = colors[scheme];
  return {
    surface: c.surfaceElevated,
    text: c.text,
    textSecondary: c.textSecondary,
    accent: c.accent,
    accentText: c.accentText,
    onAccent: c.onAccent,
    issue: c.issueText,
    track: c.surfaceSunken,
  };
};

export const WIDGET_PALETTE: WidgetPalette = { light: pick('light'), dark: pick('dark') };
