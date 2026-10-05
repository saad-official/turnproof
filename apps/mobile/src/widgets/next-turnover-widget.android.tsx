'use no memo';
// Android home-screen widget `NextTurnover` (react-native-android-widget), 2×2: the next turnover
// (property, checkout time, countdown) and today's count, or the running turnover's rooms ring.
// These components are called as plain functions to build a RemoteViews tree, so the React Compiler
// stays off (above) and no hooks may be used. Never pass `null` / `false` children: the tree builder
// cannot skip them.
import { type ColorProp, FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';

export const NEXT_TURNOVER_WIDGET_NAME = 'NextTurnover';

export type AndroidWidgetColors = {
  surface: ColorProp;
  text: ColorProp;
  textSecondary: ColorProp;
  accent: ColorProp;
  accentText: ColorProp;
  issue: ColorProp;
  track: ColorProp;
};

export type NextTurnoverWidgetAndroidProps = {
  /** Header: "NEXT TURNOVER" / "IN PROGRESS". */
  header: string;
  title: string;
  /** "Checkout 11:00 · in 1 h 20 min" / "Bathroom · 2/5 rooms". */
  subtitle: string;
  /** Subtitle in the issue colour (overdue). */
  alert: boolean;
  footer: string;
  /** Ring share 0…1 (rooms done while running, else today's finished share). */
  ring: number;
  url: string;
  colors: AndroidWidgetColors;
};

function ringSvg(share: number, c: AndroidWidgetColors): string {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(1, share)) * circumference).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="${r}" fill="none" stroke="${String(c.track)}" stroke-width="7"/>
  <circle cx="32" cy="32" r="${r}" fill="none" stroke="${String(c.accent)}" stroke-width="7" stroke-linecap="round"
    stroke-dasharray="${dash} ${circumference.toFixed(2)}" transform="rotate(-90 32 32)"/>
</svg>`;
}

export function NextTurnoverWidgetAndroid(props: NextTurnoverWidgetAndroidProps) {
  const c = props.colors;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: props.url }}
      accessibilityLabel={`${props.title}. ${props.subtitle}`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 14,
        borderRadius: 22,
        backgroundColor: c.surface,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', justifyContent: 'space-between' }}>
        <TextWidget text={props.header} style={{ fontSize: 11, fontWeight: '600', color: c.textSecondary, letterSpacing: 0.08 }} />
        <FlexWidget style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <SvgWidget svg={ringSvg(props.ring, c)} style={{ width: 40, height: 40 }} />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', flexGap: 2, width: 'match_parent' }}>
        <TextWidget text={props.title} maxLines={2} truncate="END" style={{ fontSize: 18, fontWeight: 'bold', color: c.text }} />
        <TextWidget
          text={props.subtitle}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 13, color: props.alert ? c.issue : c.accentText }}
        />
        <TextWidget text={props.footer} maxLines={1} style={{ fontSize: 12, color: c.textSecondary }} />
      </FlexWidget>
    </FlexWidget>
  );
}
