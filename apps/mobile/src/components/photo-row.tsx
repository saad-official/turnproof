import type { Turnover } from '@turnproof/shared';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { icons, type IconName } from '@/constants/icons';
import type { LocalPhoto } from '@/data';
import { radius, spacing, tileSize, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';
import { PhotoTile } from './photo-tile';

/** The big "Add before photo" tile: a sunken well with a camera glyph, the first tile in its row. */
export function AddPhotoTile({
  label,
  onPress,
  required,
  icon = icons.addPhoto,
  size = tileSize,
}: {
  label: string;
  onPress: () => void;
  required?: boolean;
  icon?: IconName;
  size?: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={required ? `${label}, required` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        backgroundColor: pressed ? colors.border : required ? colors.accentSoft : colors.surfaceSunken,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xxs,
        padding: spacing.xs,
      })}
    >
      <Icon name={icon} size={30} color={colors.accentText} />
      <AppText variant="caption" tone="accent" weight="600" align="center" numberOfLines={2}>
        {label}
      </AppText>
    </Pressable>
  );
}

export type PhotoRowProps = {
  photos: LocalPhoto[];
  turnover?: Turnover | null;
  stampGps: boolean;
  /** Omit for a read-only row (summary). */
  addLabel?: string;
  onAdd?: () => void;
  /** Highlights the add tile (the room still needs this photo). */
  required?: boolean;
  onPressPhoto?: (photo: LocalPhoto) => void;
  size?: number;
  /** Shown when there are no photos and no add tile. */
  emptyLabel?: string;
};

/**
 * A horizontal row of photo tiles (add tile first, within thumb reach). Photos captured while the
 * row is mounted animate in; the ones already there just appear.
 */
export function PhotoRow({ photos, turnover, stampGps, addLabel, onAdd, required, onPressPhoto, size = tileSize, emptyLabel }: PhotoRowProps) {
  const [mountedAt] = useState(() => Date.now());
  if (!onAdd && photos.length === 0) {
    return emptyLabel ? (
      <AppText variant="callout" tone="tertiary">
        {emptyLabel}
      </AppText>
    ) : null;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.md }}
      style={{ marginHorizontal: -spacing.md, flexGrow: 0 }}
    >
      {onAdd && addLabel ? <AddPhotoTile label={addLabel} onPress={onAdd} required={required} size={size} /> : null}
      {[...photos].reverse().map((p) => (
        <PhotoTile
          key={p.id}
          photo={p}
          turnover={turnover}
          stampGps={stampGps}
          size={size}
          isNew={Date.parse(p.createdAt) > mountedAt}
          onPress={onPressPhoto ? () => onPressPhoto(p) : undefined}
        />
      ))}
      <View style={{ width: 0 }} />
    </ScrollView>
  );
}
