import { SymbolView } from 'expo-symbols';
import { I18nManager, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import type { IconName } from '@/constants/icons';

export type IconProps = {
  name: IconName;
  size?: number;
  color: ColorValue;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  /** Mirror in right-to-left layouts (chevrons, arrows). */
  directional?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** SF Symbols on iOS, Material Symbols on Android. Decorative: label the parent control instead. */
export function Icon({ name, size = 20, color, weight = 'medium', directional, style }: IconProps) {
  return (
    <SymbolView
      name={{ ios: name.sf, android: name.md, web: name.md }}
      size={size}
      tintColor={color}
      weight={process.env.EXPO_OS === 'ios' ? weight : undefined}
      style={[{ width: size, height: size }, directional && I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : null, style]}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
